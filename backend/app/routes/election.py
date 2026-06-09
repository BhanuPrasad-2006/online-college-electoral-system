import uuid
import asyncio
import time
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import joinedload
import httpx
from fastapi.responses import StreamingResponse

from app.db.session import get_db
from app.api.deps import get_current_user, get_admin_user, require_admin_roles
from app.models.election import Election
from app.models.voter import Voter
from app.enums.election_status import ElectionStatusEnum
from app.services.email_service import send_election_email
from app.services.phase_engine import PhaseEngine
from app.utils.logger import logger
from app.schemas.election_schema import ElectionSaveRequest
from app.models.vote import Vote
from app.models.candidate import Candidate
from app.models.position import Position
from app.services.result_service import ResultService
from app.security.integrity_service import IntegrityService
from app.models.result_publication import ResultPublication
from app.services.pdf_service import PDFService
from app.services.supabase_storage import upload_election_results_pdf



router = APIRouter()

_election_row_cache: dict = {"row": None, "expires_at": 0.0}
_ELECTION_CACHE_TTL_SEC = 10.0


async def _get_latest_election_row(db: AsyncSession) -> Election | None:
    """Return latest election row with short TTL cache to cut repeated DB hits."""
    now = time.time()
    cached = _election_row_cache.get("row")
    if cached is not None and now < _election_row_cache["expires_at"]:
        return cached

    result = await db.execute(select(Election).order_by(Election.created_at.desc()))
    election = result.scalars().first()
    _election_row_cache["row"] = election
    _election_row_cache["expires_at"] = now + _ELECTION_CACHE_TTL_SEC
    return election


def _reset_election_cache() -> None:
    _election_row_cache["row"] = None
    _election_row_cache["expires_at"] = 0.0


def _validate_election_schedule(payload: ElectionSaveRequest) -> None:
    if payload.registration_start and payload.registration_end:
        if payload.registration_end <= payload.registration_start:
            raise HTTPException(
                status_code=400,
                detail="Registration closes must be after registration opens."
            )

    if payload.document_deadline:
        if payload.registration_end and payload.document_deadline <= payload.registration_end:
            raise HTTPException(
                status_code=400,
                detail="Document deadline must be after registration closes."
            )
        if payload.voting_start and payload.document_deadline >= payload.voting_start:
            raise HTTPException(
                status_code=400,
                detail="Document deadline must be before voting opens."
            )

    if payload.registration_end and payload.voting_start:
        if payload.voting_start <= payload.registration_end:
            raise HTTPException(
                status_code=400,
                detail="Voting opens must be after registration closes."
            )

    if payload.voting_start and payload.voting_end:
        if payload.voting_end <= payload.voting_start:
            raise HTTPException(
                status_code=400,
                detail="Voting closes must be after voting opens."
            )


async def notify_registration_open(election: Election):
    """Notify all voters and candidates that registration is open and provide the schedule."""
    try:
        from app.db.session import SessionLocal
        async with SessionLocal() as db:
            result = await db.execute(select(Voter))
            voters = result.scalars().all()
            
            portal_url = "http://localhost:8080/candidate/register"
            
            logger.info(f"Broadcasting schedule announced to {len(voters)} voters...")
            
            for voter in voters:
                if not voter.college_email:
                    continue
                    
                email_body = f"""
                <html>
                <body style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 24px;">
                    <div style="background: #1e40af; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                        <h2 style="color: white; margin: 0;">🗳️ College Election Portal</h2>
                    </div>
                    <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
                        <p style="color: #374151; font-size: 16px;">Hi <strong>{voter.full_name}</strong>,</p>
                        <p style="color: #374151; font-size: 15px; line-height: 1.5;">
                            The schedule for <strong>{election.title}</strong> has been announced!
                        </p>
                        
                        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
                            <h3 style="margin-top: 0; color: #1e40af; font-size: 16px;">📅 Election Timetable</h3>
                            <ul style="padding-left: 20px; color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 0;">
                                <li><strong>Registration Opens:</strong> {election.registration_start.strftime('%Y-%m-%d %H:%M UTC') if election.registration_start else 'TBA'}</li>
                                <li><strong>Registration Closes:</strong> {election.registration_end.strftime('%Y-%m-%d %H:%M UTC') if election.registration_end else 'TBA'}</li>
                                <li><strong>Campaign Period:</strong> Starts after registration closes</li>
                                <li><strong>Voting Opens:</strong> {election.voting_start.strftime('%Y-%m-%d %H:%M UTC') if election.voting_start else 'TBA'}</li>
                                <li><strong>Voting Closes:</strong> {election.voting_end.strftime('%Y-%m-%d %H:%M UTC') if election.voting_end else 'TBA'}</li>
                            </ul>
                        </div>
                        
                        <p style="color: #374151; font-size: 15px; line-height: 1.5;">
                            If you wish to participate as a candidate, you can register and upload your manifesto through the portal during the registration period.
                        </p>
                        <div style="text-align: center; margin: 24px 0;">
                            <a href="{portal_url}" style="background: #1e40af; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">
                                Go to Portal
                            </a>
                        </div>
                    </div>
                </body>
                </html>
                """
                await send_election_email(
                    to_email=voter.college_email,
                    recipient_name=voter.full_name,
                    subject=f"Election Schedule Announced: {election.title}",
                    html_body=email_body
                )
    except Exception as e:
        logger.error(f"Error in notify_registration_open: {e}", exc_info=True)


async def notify_voting_started(election_title: str):
    """Notify all voters and contestants (candidates) via email that voting has started."""
    try:
        from app.db.session import SessionLocal
        async with SessionLocal() as db:
            # Fetch all voters
            result = await db.execute(select(Voter))
            voters = result.scalars().all()
            
            login_url = "http://localhost:8080/login"
            
            logger.info(f"Broadcasting voting started notifications to {len(voters)} voters...")
            
            for voter in voters:
                if not voter.college_email:
                    continue
                    
                email_body = f"""
                <html>
                <body style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 24px;">
                    <div style="background: #1e40af; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                        <h2 style="color: white; margin: 0;">🗳️ College Election Portal</h2>
                    </div>
                    <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
                        <p style="color: #374151; font-size: 16px;">Hi <strong>{voter.full_name}</strong>,</p>
                        <p style="color: #374151; font-size: 15px; line-height: 1.5;">
                            Voting has officially started for <strong>{election_title}</strong>!
                        </p>
                        <p style="color: #374151; font-size: 15px; line-height: 1.5;">
                            Please cast your vote securely by logging into the portal using the link below:
                        </p>
                        <div style="text-align: center; margin: 24px 0;">
                            <a href="{login_url}" style="background: #1e40af; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">
                                Go to Voting Portal
                            </a>
                        </div>
                        <p style="color: #6b7280; font-size: 13px; line-height: 1.4;">
                            🔒 Your vote is cast completely anonymously using state-of-the-art cryptographic hashing.
                        </p>
                        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                            This is an automated notification from the College Electoral System.
                        </p>
                    </div>
                </body>
                </html>
                """
                
                asyncio.create_task(
                    send_election_email(
                        to_email=voter.college_email,
                        recipient_name=voter.full_name,
                        subject=f"Voting Started - {election_title}",
                        html_body=email_body
                    )
                )
    except Exception as e:
        logger.error(f"Error in notify_voting_started: {e}", exc_info=True)


async def notify_results_published(election_title: str, winner_summary_html: str = "", pdf_url: str = ""):
    """Notify all voters and contestants (candidates) via email that results are published."""
    try:
        from app.db.session import SessionLocal
        async with SessionLocal() as db:
            # If pdf_url or winner_summary_html is not provided, fetch from DB
            if not pdf_url or not winner_summary_html:
                # Find the election
                election_res = await db.execute(select(Election).where(Election.title == election_title).order_by(Election.created_at.desc()))
                election = election_res.scalar_one_or_none()
                if election:
                    if not pdf_url:
                        pub_res = await db.execute(select(ResultPublication).where(ResultPublication.election_id == election.election_id))
                        pub = pub_res.scalar_one_or_none()
                        if pub:
                            pdf_url = pub.pdf_url
                    
                    if not winner_summary_html:
                        # Fetch all positions and winners
                        pos_res = await db.execute(select(Position).where(Position.election_id == election.election_id))
                        positions = pos_res.scalars().all()
                        winner_summary_list = []
                        for position in positions:
                            cand_res = await db.execute(
                                select(Candidate)
                                .options(joinedload(Candidate.voter))
                                .where(Candidate.position_id == position.position_id, Candidate.is_winner == True)
                            )
                            winners = cand_res.scalars().all()
                            winners_names = [w.voter.full_name for w in winners if w.voter]
                            winners_list_str = ", ".join(winners_names) if winners_names else "None"
                            winner_summary_list.append(f"<b>{position.title}:</b> 🏆 {winners_list_str}")
                        winner_summary_html = "<br/>".join(winner_summary_list)

            # Fetch all voters
            result = await db.execute(select(Voter))
            voters = result.scalars().all()
            
            logger.info(f"Broadcasting results published notifications to {len(voters)} voters...")
            
            for voter in voters:
                if not voter.college_email:
                    continue
                    
                email_body = f"""
                <html>
                <body style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 24px;">
                    <div style="background: #6c63ff; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                        <h2 style="color: white; margin: 0;">🗳️ Election Results Announced!</h2>
                    </div>
                    <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
                        <p style="color: #374151; font-size: 16px;">Hi <strong>{voter.full_name}</strong>,</p>
                        <p style="color: #374151; font-size: 15px; line-height: 1.5;">
                            The results for <strong>{election_title}</strong> are officially out! Here is the winner summary:
                        </p>
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 16px 0;">
                            {winner_summary_html}
                        </div>
                        <p style="color: #374151; font-size: 15px; line-height: 1.5;">
                            You can view the detailed results and download the official signed results PDF:
                        </p>
                        <div style="text-align: center; margin: 24px 0;">
                            <a href="{pdf_url}" style="background: #6c63ff; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">
                                Download Results PDF
                            </a>
                        </div>
                        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                            This is an automated notification from the College Electoral System.
                        </p>
                    </div>
                </body>
                </html>
                """
                
                asyncio.create_task(
                    send_election_email(
                        to_email=voter.college_email,
                        recipient_name=voter.full_name,
                        subject=f"Results Announced - {election_title}",
                        html_body=email_body
                    )
                )
    except Exception as e:
        logger.error(f"Error in notify_results_published: {e}", exc_info=True)



@router.get("/current")
async def get_current_election(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Fetch the current election."""
    election = await _get_latest_election_row(db)
    if not election:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No election found."
        )
    return election


@router.get("/current-phase")
async def get_current_election_phase(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Fetch the real-time phase of the current election."""
    election = await _get_latest_election_row(db)
    if not election:
        return {"phase": "unknown", "remaining_time": None}
        
    current_phase = PhaseEngine.get_current_phase(election)
    next_phase = PhaseEngine.get_next_phase(current_phase)
    time_remaining = PhaseEngine.get_time_remaining(election, current_phase)
    
    return {
        "phase": current_phase,
        "next_phase": next_phase,
        "remaining_time": time_remaining,
        "is_paused": election.is_paused,
        "auto_transition": election.auto_transition
    }


@router.get("/stats/departments")
async def get_department_stats(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Dynamically fetch voting statistics for all departments from the database."""
    from sqlalchemy import func, case
    
    query = select(
        func.coalesce(Voter.department, "Unknown").label("department"),
        func.count(Voter.voter_id).label("total_voters"),
        func.sum(case((Voter.has_voted == True, 1), else_=0)).label("voted")
    ).group_by(Voter.department)

    result = await db.execute(query)
    
    stats = []
    for row in result.all():
        total = row.total_voters
        voted = row.voted or 0
        not_voted = total - voted
        turnout = (voted / total * 100) if total > 0 else 0
        
        stats.append({
            "department": row.department,
            "total_voters": total,
            "voted": voted,
            "not_voted": not_voted,
            "turnout_percentage": round(turnout, 1)
        })
        
    # Sort alphabetically by department name
    stats.sort(key=lambda x: x["department"])
    return stats


@router.get("/stats/hourly")
async def get_hourly_stats(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Fetch hourly vote distribution for the current election."""
    from sqlalchemy import func as sa_func
    
    result = await db.execute(select(Election).order_by(Election.created_at.desc()))
    election = result.scalars().first()
    if not election or not election.voting_start:
        return []

    # Query votes grouped by hour since voting started
    # Use timestamp_utc column which exists on Vote model
    from sqlalchemy import literal_column
    hourly_query = select(
        sa_func.date_trunc(literal_column("'hour'"), Vote.timestamp_utc).label('hour'),
        sa_func.count(Vote.vote_id).label('count')
    ).where(
        Vote.timestamp_utc >= election.voting_start
    ).group_by(
        sa_func.date_trunc(literal_column("'hour'"), Vote.timestamp_utc)
    ).order_by(
        sa_func.date_trunc(literal_column("'hour'"), Vote.timestamp_utc)
    )
    
    hourly_result = await db.execute(hourly_query)
    rows = hourly_result.all()
    
    return [
        {
            "hour": str(row.hour),
            "votes": row.count
        }
        for row in rows
    ]


@router.get("/kpi")
async def get_election_kpi(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Fetch high-level KPI metrics for the election (real-time)."""
    from sqlalchemy import func, case
    from app.models.ai_alert import AIAlert
    
    query = select(
        func.count(Voter.voter_id).label("registered"),
        func.sum(case((Voter.has_voted == True, 1), else_=0)).label("voted")
    )
    result = await db.execute(query)
    row = result.first()
    
    registered = row.registered or 0
    votesCast = row.voted or 0
    turnout = round((votesCast / registered * 100), 1) if registered > 0 else 0.0
    
    # Query count of unresolved security alerts
    alerts_query = select(func.count(AIAlert.alert_id)).where(AIAlert.is_resolved == False)
    alerts_result = await db.execute(alerts_query)
    alerts_count = alerts_result.scalar() or 0
    
    return {
        "registered": registered,
        "votesCast": votesCast,
        "turnout": turnout,
        "alerts": alerts_count
    }

@router.get("/notifications")
async def get_notifications(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Fetch real-time notifications for the user."""
    # Since we don't have a dedicated notifications table, we derive some from the election phase.
    election = await _get_latest_election_row(db)
    
    notifications = []
    if election:
        current_phase = PhaseEngine.get_current_phase(election)
        time_rem = PhaseEngine.get_time_remaining(election, current_phase)
        
        if current_phase == "registration_open":
            notifications.append({"id": "1", "title": f"Registration closes in {time_rem}", "time": "Just now", "unread": True, "type": "announcement"})
        elif current_phase == "voting_open":
            notifications.append({"id": "1", "title": f"Voting closes in {time_rem}", "time": "Just now", "unread": True, "type": "announcement"})
        elif current_phase == "results_published":
            notifications.append({"id": "1", "title": "Results are published!", "time": "Just now", "unread": True, "type": "system"})
        else:
            notifications.append({"id": "1", "title": f"Current Phase: {current_phase.replace('_', ' ').title()}", "time": "Just now", "unread": False, "type": "system"})
            
    notifications.append({"id": "2", "title": "Welcome to the real-time election portal", "time": "1 min ago", "unread": False, "type": "system"})

    # Fetch official notices
    from app.models.notice import Notice
    notice_query = select(Notice).order_by(Notice.created_at.desc()).limit(10)
    notice_res = await db.execute(notice_query)
    notices = notice_res.scalars().all()
    for n in notices:
        notifications.append({
            "id": f"notice_{n.notice_id}",
            "title": f"Official Notice: {n.title}",
            "time": n.created_at.strftime("%Y-%m-%d %H:%M") if n.created_at else "Just now",
            "unread": True,
            "type": "notice",
            "priority": n.priority,
            "pdf_url": f"/api/v1/admin/notices/{n.notice_id}/pdf" if n.pdf_url else None,
            "content": n.content[:200] + "..." if len(n.content) > 200 else n.content
        })

    # Fetch meetings (only if logged-in user is an admin)
    if current_user.get("role") == "admin":
        from app.models.admin_meeting import AdminMeeting
        from app.models.meeting_participant import MeetingParticipant
        
        admin_uuid = uuid.UUID(current_user["user_id"])
        meeting_query = (
            select(AdminMeeting)
            .outerjoin(MeetingParticipant, AdminMeeting.meeting_id == MeetingParticipant.meeting_id)
            .where(
                (AdminMeeting.created_by == admin_uuid) |
                (MeetingParticipant.admin_id == admin_uuid)
            )
            .order_by(AdminMeeting.meeting_time.desc())
            .limit(10)
        )
        meet_res = await db.execute(meeting_query)
        meetings = meet_res.scalars().unique().all()
        for m in meetings:
            notifications.append({
                "id": f"meeting_{m.meeting_id}",
                "title": f"Meeting: {m.title}",
                "time": m.meeting_time.strftime("%Y-%m-%d %H:%M") if m.meeting_time else "Scheduled",
                "unread": True,
                "type": "meeting",
                "jitsi_link": m.jitsi_link,
                "agenda": m.agenda
            })

    return notifications


@router.post("/")
async def create_election(
    payload: ElectionSaveRequest,
    admin: dict = Depends(require_admin_roles(["SUPER_ADMIN", "ELECTION_MANAGER"])),
    db: AsyncSession = Depends(get_db)
):
    """Create a new election record when none exists yet."""
    _validate_election_schedule(payload)

    admin_id = admin.get("user_id")
    created_by = None
    if admin_id:
        try:
            created_by = uuid.UUID(admin_id)
        except ValueError:
            created_by = None

    election = Election(
        title=payload.title,
        registration_start=payload.registration_start,
        registration_end=payload.registration_end,
        document_deadline=payload.document_deadline,
        voting_start=payload.voting_start,
        voting_end=payload.voting_end,
        eligible_department=payload.eligible_department,
        status=ElectionStatusEnum.UPCOMING.value,
        created_by=created_by,
    )

    db.add(election)
    await db.commit()
    await db.refresh(election)
    _reset_election_cache()

    return {"message": "Election created successfully.", "election": election}

@router.post("/{election_id}/announce")
async def announce_election_schedule(
    election_id: str,
    admin: dict = Depends(require_admin_roles(["SUPER_ADMIN", "ELECTION_MANAGER"])),
    db: AsyncSession = Depends(get_db)
):
    """Trigger the schedule announcement email to all users."""
    try:
        election_uuid = uuid.UUID(election_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid election ID format")
        
    result = await db.execute(select(Election).where(Election.election_id == election_uuid))
    election = result.scalar_one_or_none()
    if not election:
        raise HTTPException(status_code=404, detail="Election not found")
        
    # Trigger background email
    asyncio.create_task(notify_registration_open(election))
    return {"message": "Election schedule announced to all participants."}


@router.post("/{election_id}/pause")
async def pause_election(
    election_id: str,
    admin: dict = Depends(require_admin_roles(["SUPER_ADMIN", "ELECTION_MANAGER"])),
    db: AsyncSession = Depends(get_db)
):
    """Pause the election (freezes all phases)."""
    try:
        election_uuid = uuid.UUID(election_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid format")
    result = await db.execute(select(Election).where(Election.election_id == election_uuid))
    election = result.scalar_one_or_none()
    if not election:
        raise HTTPException(status_code=404, detail="Not found")
    election.is_paused = True
    await db.commit()
    _reset_election_cache()
    return {"message": "Election paused."}


@router.post("/{election_id}/resume")
async def resume_election(
    election_id: str,
    admin: dict = Depends(require_admin_roles(["SUPER_ADMIN", "ELECTION_MANAGER"])),
    db: AsyncSession = Depends(get_db)
):
    """Resume a paused election."""
    try:
        election_uuid = uuid.UUID(election_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid format")
    result = await db.execute(select(Election).where(Election.election_id == election_uuid))
    election = result.scalar_one_or_none()
    if not election:
        raise HTTPException(status_code=404, detail="Not found")
    election.is_paused = False
    await db.commit()
    _reset_election_cache()
    return {"message": "Election resumed."}


@router.post("/{election_id}/emergency-stop")
async def emergency_stop_election(
    election_id: str,
    admin: dict = Depends(require_admin_roles(["SUPER_ADMIN", "ELECTION_MANAGER"])),
    db: AsyncSession = Depends(get_db)
):
    """Emergency stop: Immediately set voting_end to now and status to closed."""
    try:
        election_uuid = uuid.UUID(election_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid format")
    result = await db.execute(select(Election).where(Election.election_id == election_uuid))
    election = result.scalar_one_or_none()
    if not election:
        raise HTTPException(status_code=404, detail="Not found")
        
    election.voting_end = datetime.now(timezone.utc)
    election.status = ElectionStatusEnum.CLOSED.value
    await db.commit()
    _reset_election_cache()
    return {"message": "Emergency stop executed. Voting closed."}


@router.post("/{election_id}/open-voting")
async def open_voting(
    election_id: str,
    admin: dict = Depends(require_admin_roles(["SUPER_ADMIN", "ELECTION_MANAGER"])),
    db: AsyncSession = Depends(get_db)
):
    """Start voting phase for an election and notify all participants.

    Automatically ensures `voting_end` is set to a future time if:
      - It was never configured (None), or
      - It is in the past (stale date from a previous schedule).

    This prevents PhaseEngine from returning "voting_closed" due to inconsistent
    dates after a manual Force Open Voting override.
    """
    try:
        election_uuid = uuid.UUID(election_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid election ID format")
        
    result = await db.execute(select(Election).where(Election.election_id == election_uuid))
    election = result.scalar_one_or_none()
    if not election:
        raise HTTPException(status_code=404, detail="Election not found")

    now = datetime.now(timezone.utc)

    election.status = ElectionStatusEnum.VOTING_OPEN.value
    election.voting_start = now

    # ── Ensure voting_end is set to a valid future time ─────────────
    # If voting_end is None or already in the past, extend it to 24h from now.
    # This prevents PhaseEngine date-based logic from immediately returning
    # "voting_closed" after Force Open Voting.
    if election.voting_end is None:
        election.voting_end = now + timedelta(hours=24)
    else:
        ve = election.voting_end
        if ve.tzinfo is not None:
            ve = ve.astimezone(timezone.utc).replace(tzinfo=None)
        now_naive = now.replace(tzinfo=None)
        if ve <= now_naive:
            election.voting_end = now + timedelta(hours=24)

    await db.commit()
    await db.refresh(election)
    _reset_election_cache()
    
    # Notify voters in background
    asyncio.create_task(notify_voting_started(election.title))
    
    return {"message": "Voting successfully opened", "status": election.status}


@router.post("/{election_id}/close-voting")
async def close_voting(
    election_id: str,
    admin: dict = Depends(require_admin_roles(["SUPER_ADMIN", "ELECTION_MANAGER"])),
    db: AsyncSession = Depends(get_db)
):
    """Close voting phase for an election.

    Sets status to CLOSED and records the closing time.
    PhaseEngine.get_current_phase() will return "voting_closed" because
    the CLOSED status is checked before date-based logic.
    """
    try:
        election_uuid = uuid.UUID(election_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid election ID format")
        
    result = await db.execute(select(Election).where(Election.election_id == election_uuid))
    election = result.scalar_one_or_none()
    if not election:
        raise HTTPException(status_code=404, detail="Election not found")
        
    election.status = ElectionStatusEnum.CLOSED.value
    election.voting_end = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(election)
    _reset_election_cache()
    
    return {"message": "Voting successfully closed", "status": election.status}


@router.post("/{election_id}/publish-results")
async def publish_results(
    request: Request,
    election_id: str,
    admin: dict = Depends(require_admin_roles(["SUPER_ADMIN"])),
    db: AsyncSession = Depends(get_db)
):
    """Publish election results and notify all participants."""
    try:
        election_uuid = uuid.UUID(election_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid election ID format")
        
    result = await db.execute(select(Election).where(Election.election_id == election_uuid))
    election = result.scalar_one_or_none()
    if not election:
        raise HTTPException(status_code=404, detail="Election not found")

    # ── Publication Lock ─────────────────────────────────────
    if election.results_published:
        raise HTTPException(
            status_code=400,
            detail="Results already published"
        )
        
    election.status = ElectionStatusEnum.RESULTS_PUBLISHED.value
    election.results_published = True
    election.results_published_at = datetime.now(timezone.utc)

    # ── Compute and store integrity hash snapshot ───────────
    integrity = IntegrityService()
    integrity_hash = await integrity.generate_result_hash(db, str(election_uuid))
    election.result_integrity_hash = integrity_hash

    # ── Determine and Save Winners ───────────────────────────
    winners_by_position = {}
    winner_summary_list = []
    
    try:
        result_service = ResultService(db)
        summaries = await result_service.determine_winners(str(election_uuid))
        
        for summary in summaries:
            position_id = summary["position_id"]
            
            # Fetch Position details
            pos_res = await db.execute(select(Position).where(Position.position_id == uuid.UUID(position_id)))
            pos_obj = pos_res.scalar_one_or_none()
            pos_title = pos_obj.title if pos_obj else f"Position {position_id[:8]}"
            
            winners_by_position[pos_title] = []
            
            for cand_info in summary["candidates"]:
                cand_id = cand_info["candidate_id"]
                if cand_id and cand_id != "NOTA":
                    cand_uuid = uuid.UUID(cand_id)
                    winner_status = cand_info.get("winner_status")
                    # Handle ties: mark both as winner if winner_status is WON or TIE
                    is_winner = winner_status in ("WON", "TIE")
                    
                    # Store winners permanently
                    await db.execute(
                        update(Candidate)
                        .where(Candidate.candidate_id == cand_uuid)
                        .values(
                            is_winner=is_winner,
                            winner_announced_at=datetime.now(timezone.utc) if is_winner else None
                        )
                    )
                    
                    if is_winner:
                        # Fetch Candidate Voter details for the summary
                        cand_res = await db.execute(
                            select(Candidate)
                            .options(joinedload(Candidate.voter))
                            .where(Candidate.candidate_id == cand_uuid)
                        )
                        cand_obj = cand_res.scalar_one_or_none()
                        cand_name = cand_obj.voter.full_name if cand_obj and cand_obj.voter else "Unknown Candidate"
                        winners_by_position[pos_title].append(cand_name)
            
            # Form summary list for email and dashboard
            winners_list_str = ", ".join(winners_by_position[pos_title]) if winners_by_position[pos_title] else "None"
            winner_summary_list.append(f"<b>{pos_title}:</b> 🏆 {winners_list_str}")
            
    except Exception as e:
        logger.error(f"Failed to calculate and store winners: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to compute and store election winners: {str(e)}")

    # ── Format results for PDF ──────────────────────────────
    raw_results = await result_service.compute_results(str(election_uuid))
    pdf_results = []
    
    position_ids = [uuid.UUID(pid) for pid in raw_results.keys()]
    position_map = {}
    if position_ids:
        pos_res = await db.execute(select(Position).where(Position.position_id.in_(position_ids)))
        position_map = {str(p.position_id): p for p in pos_res.scalars().all()}
        
    candidate_ids = []
    for tallies in raw_results.values():
        for entry in tallies:
            cid = entry["candidate_id"]
            if cid and cid != "NOTA":
                candidate_ids.append(uuid.UUID(cid))
                
    candidate_map = {}
    if candidate_ids:
        cand_res = await db.execute(
            select(Candidate)
            .options(joinedload(Candidate.voter))
            .where(Candidate.candidate_id.in_(candidate_ids))
        )
        candidate_map = {str(c.candidate_id): c for c in cand_res.scalars().unique().all()}

    for position_id, tallies in raw_results.items():
        position = position_map.get(position_id)
        position_title = position.title if position else f"Position {position_id[:8]}"
        total_pos_votes = sum(entry["vote_count"] for entry in tallies)
        
        candidates_data = []
        for entry in tallies:
            cand_id = entry["candidate_id"]
            name = "NOTA"
            is_winner = False
            if cand_id and cand_id != "NOTA":
                candidate_obj = candidate_map.get(cand_id)
                if candidate_obj and candidate_obj.voter:
                    name = candidate_obj.voter.full_name
                    is_winner = candidate_obj.is_winner
                else:
                    name = "Unknown"
            
            percentage = round((entry["vote_count"] / total_pos_votes * 100), 2) if total_pos_votes > 0 else 0.0
            candidates_data.append({
                "name": name,
                "votes": entry["vote_count"],
                "percentage": percentage,
                "is_winner": is_winner
            })
            
        candidates_data.sort(key=lambda c: c["votes"], reverse=True)
        pdf_results.append({"position": position_title, "candidates": candidates_data})

    # ── Fetch Admin details for PDF and Audit ───────────────
    admin_id = admin.get("user_id")
    admin_uuid = None
    admin_name = "Unknown Admin"
    admin_email = "admin@college.edu.in"
    if admin_id:
        try:
            admin_uuid = uuid.UUID(admin_id)
            admin_res = await db.execute(select(AdminUser).where(AdminUser.admin_id == admin_uuid))
            admin_user = admin_res.scalar_one_or_none()
            if admin_user:
                admin_name = admin_user.full_name
                admin_email = admin_user.email
        except Exception:
            pass

    # ── Generate and Upload PDF to Supabase Storage ─────────
    publication_id = uuid.uuid4()
    college_name = "Online College Electoral System"
    election_year = str(election.voting_end.year) if election.voting_end else str(datetime.now().year)
    published_at_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    
    pdf_buffer = PDFService.generate_election_results_pdf(
        college_name=college_name,
        election_name=election.title,
        election_year=election_year,
        election_id=str(election.election_id),
        publication_id=str(publication_id),
        published_by_email=admin_email,
        published_at_str=published_at_str,
        audit_hash=integrity_hash,
        results=pdf_results
    )
    
    try:
        uploaded_obj = await upload_election_results_pdf(
            election_id=str(election.election_id),
            filename=f"results_{election.election_id}.pdf",
            data=pdf_buffer.getvalue()
        )
        pdf_url = uploaded_obj.public_url
    except Exception as upload_exc:
        logger.error(f"Failed to upload results PDF to Supabase: {upload_exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload results PDF to Supabase Storage: {str(upload_exc)}"
        )

    # ── Create ResultPublication Track Record ────────────────
    publication = ResultPublication(
        publication_id=publication_id,
        election_id=election.election_id,
        published_by=admin_uuid,
        published_at=datetime.now(timezone.utc),
        pdf_url=pdf_url,
        audit_hash=integrity_hash
    )
    db.add(publication)

    # ── Audit Log ────────────────────────────────────────────
    from app.utils.helpers import extract_client_ip
    from app.models.audit_log import AuditLog
    
    ip_addr = extract_client_ip(request)
    
    winners_audit_text = ""
    for pos_title, winner_list in winners_by_position.items():
        winners_audit_text += f"{pos_title}:\n" + "\n".join(winner_list) + "\n\n"
        
    audit_desc = (
        f"RESULTS_PUBLISHED\n\n"
        f"Election:\n{election.title}\n\n"
        f"Published By:\n{admin_email}\n\n"
        f"{winners_audit_text.strip()}\n\n"
        f"Audit Hash:\n{integrity_hash}"
    )
    
    audit_entry = AuditLog(
        event_type="RESULTS_PUBLISHED",
        actor_id=admin_uuid,
        description=audit_desc,
        ip_address=ip_addr,
        created_at=datetime.now(timezone.utc),
    )
    db.add(audit_entry)

    await db.commit()
    await db.refresh(election)
    _reset_election_cache()

    # ── Trigger Email Notifications ──────────────────────────
    winner_summary_html = "<br/>".join(winner_summary_list)
    asyncio.create_task(notify_results_published(election.title, winner_summary_html, pdf_url))

    return {
        "message": "Results successfully published",
        "status": election.status,
        "integrity_hash": integrity_hash,
        "pdf_url": pdf_url,
        "publication_id": str(publication_id),
    }



@router.get("/public-results")
async def get_public_results(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Public results endpoint — only returns data when results are published.
    During voting or before, returns a "not available yet" response.
    """
    election = await _get_latest_election_row(db)
    if not election:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No election found."
        )

    current_phase = PhaseEngine.get_current_phase(election)

    # Only show full results in results_announced phase
    if current_phase != "results_announced":
        return {
            "phase": current_phase,
            "published": False,
            "message": "Results are not yet available.",
            "results": None,
        }

    # Compute results
    result_service = ResultService(db)
    raw = await result_service.compute_results(str(election.election_id))

    position_ids = []
    candidate_ids = []
    for position_id, tallies in raw.items():
        try:
            position_ids.append(uuid.UUID(position_id))
        except ValueError:
            pass
        for entry in tallies:
            cand_id = entry["candidate_id"]
            if cand_id and cand_id != "NOTA":
                try:
                    candidate_ids.append(uuid.UUID(cand_id))
                except ValueError:
                    pass

    position_map: dict = {}
    if position_ids:
        pos_res = await db.execute(select(Position).where(Position.position_id.in_(position_ids)))
        position_map = {str(p.position_id): p for p in pos_res.scalars().all()}

    candidate_map: dict = {}
    if candidate_ids:
        cand_res = await db.execute(
            select(Candidate)
            .options(joinedload(Candidate.voter))
            .where(Candidate.candidate_id.in_(candidate_ids))
        )
        candidate_map = {str(c.candidate_id): c for c in cand_res.scalars().unique().all()}

    formatted = []
    for position_id, tallies in raw.items():
        position = position_map.get(position_id)
        position_title = position.title if position else f"Position {position_id[:8]}"

        total_pos_votes = sum(entry["vote_count"] for entry in tallies)
        candidates_data = []
        for entry in tallies:
            cand_id = entry["candidate_id"]
            name = "NOTA"
            is_winner = False
            winner_announced_at = None
            if cand_id and cand_id != "NOTA":
                candidate_obj = candidate_map.get(cand_id)
                if candidate_obj and candidate_obj.voter:
                    name = candidate_obj.voter.full_name
                    is_winner = candidate_obj.is_winner
                    winner_announced_at = candidate_obj.winner_announced_at.isoformat() if candidate_obj.winner_announced_at else None
                else:
                    name = "Unknown"
            
            percentage = round((entry["vote_count"] / total_pos_votes * 100), 2) if total_pos_votes > 0 else 0.0
            candidates_data.append({
                "name": name,
                "candidate_name": name,
                "votes": entry["vote_count"],
                "percentage": percentage,
                "is_winner": is_winner,
                "winner_announced_at": winner_announced_at
            })
            
        candidates_data.sort(key=lambda c: c["votes"], reverse=True)
        formatted.append({"position": position_title, "candidates": candidates_data})

    return {
        "phase": current_phase,
        "published": True,
        "election_id": str(election.election_id),
        "election_title": election.title,
        "results": formatted,
    }



@router.get("/{election_id}/results")
async def get_election_results(
    election_id: str,
    admin: dict = Depends(require_admin_roles(["SUPER_ADMIN", "ELECTION_MANAGER"])),
    db: AsyncSession = Depends(get_db),
):
    """Compute and return election results with integrity hash."""
    try:
        election_uuid = uuid.UUID(election_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid election ID format")

    election_result = await db.execute(select(Election).where(Election.election_id == election_uuid))
    election = election_result.scalar_one_or_none()
    if not election:
        raise HTTPException(status_code=404, detail="Election not found")

    result_service = ResultService(db)
    raw = await result_service.compute_results(str(election_uuid))

    position_ids = []
    candidate_ids = []
    for position_id, tallies in raw.items():
        try:
            position_ids.append(uuid.UUID(position_id))
        except ValueError:
            pass
        for entry in tallies:
            cand_id = entry["candidate_id"]
            if cand_id and cand_id != "NOTA":
                try:
                    candidate_ids.append(uuid.UUID(cand_id))
                except ValueError:
                    pass

    position_map: dict = {}
    if position_ids:
        pos_res = await db.execute(select(Position).where(Position.position_id.in_(position_ids)))
        position_map = {str(p.position_id): p for p in pos_res.scalars().all()}

    candidate_map: dict = {}
    if candidate_ids:
        cand_res = await db.execute(
            select(Candidate)
            .options(joinedload(Candidate.voter))
            .where(Candidate.candidate_id.in_(candidate_ids))
        )
        candidate_map = {str(c.candidate_id): c for c in cand_res.scalars().unique().all()}

    formatted = []
    for position_id, tallies in raw.items():
        position = position_map.get(position_id)
        position_title = position.title if position else f"Position {position_id[:8]}"

        total_pos_votes = sum(entry["vote_count"] for entry in tallies)
        candidates_data = []
        for entry in tallies:
            cand_id = entry["candidate_id"]
            name = "NOTA"
            is_winner = False
            winner_announced_at = None
            if cand_id and cand_id != "NOTA":
                candidate = candidate_map.get(cand_id)
                if candidate and candidate.voter:
                    name = candidate.voter.full_name
                    is_winner = candidate.is_winner
                    winner_announced_at = candidate.winner_announced_at.isoformat() if candidate.winner_announced_at else None
                else:
                    name = "Unknown"
            
            percentage = round((entry["vote_count"] / total_pos_votes * 100), 2) if total_pos_votes > 0 else 0.0
            candidates_data.append({
                "name": name,
                "candidate_name": name,
                "votes": entry["vote_count"],
                "percentage": percentage,
                "is_winner": is_winner,
                "winner_announced_at": winner_announced_at
            })
            
        candidates_data.sort(key=lambda c: c["votes"], reverse=True)
        formatted.append({"position": position_title, "candidates": candidates_data})

    integrity = IntegrityService()
    integrity_hash = await integrity.generate_result_hash(db, str(election_uuid))

    return {
        "election_id": str(election_uuid),
        "status": election.status,
        "results": formatted,
        "integrity_hash": integrity_hash,
    }


@router.get("/{election_id}/results/pdf")
async def get_election_results_pdf(
    election_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Fetch the published results PDF and return as direct download."""
    try:
        election_uuid = uuid.UUID(election_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid election ID format")
        
    result = await db.execute(select(ResultPublication).where(ResultPublication.election_id == election_uuid))
    publication = result.scalar_one_or_none()
    if not publication:
        raise HTTPException(status_code=404, detail="Results PDF not found or not yet published")
        
    # Download the file from Supabase and stream it
    async def stream_file():
        async with httpx.AsyncClient() as client:
            async with client.stream("GET", publication.pdf_url) as r:
                if r.status_code >= 400:
                    raise HTTPException(status_code=500, detail="Failed to fetch PDF from storage")
                async for chunk in r.iter_bytes():
                    yield chunk
                    
    return StreamingResponse(
        stream_file(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=results_{election_id}.pdf"}
    )



@router.put("/{election_id}")
async def update_election_dates(
    election_id: str,
    payload: ElectionSaveRequest,
    admin: dict = Depends(require_admin_roles(["SUPER_ADMIN", "ELECTION_MANAGER"])),
    db: AsyncSession = Depends(get_db)
):
    """Update election title and dates with strict validation."""
    try:
        election_uuid = uuid.UUID(election_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid election ID format")
        
    result = await db.execute(select(Election).where(Election.election_id == election_uuid))
    election = result.scalar_one_or_none()
    if not election:
        raise HTTPException(status_code=404, detail="Election not found")
        
    _validate_election_schedule(payload)

    election.title = payload.title
    election.registration_start = payload.registration_start
    election.registration_end = payload.registration_end
    election.document_deadline = payload.document_deadline
    election.voting_start = payload.voting_start
    election.voting_end = payload.voting_end
    election.eligible_department = payload.eligible_department
    
    await db.commit()
    await db.refresh(election)
    _reset_election_cache()
    
    return {"message": "Election details saved successfully.", "election": election}

