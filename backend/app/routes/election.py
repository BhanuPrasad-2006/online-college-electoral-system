import uuid
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.api.deps import get_current_user, get_admin_user
from app.models.election import Election
from app.models.voter import Voter
from app.enums.election_status import ElectionStatusEnum
from app.services.email_service import send_election_email
from app.services.phase_engine import PhaseEngine
from app.utils.logger import logger
from app.schemas.election_schema import ElectionSaveRequest


router = APIRouter()

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


async def notify_results_published(election_title: str):
    """Notify all voters and contestants (candidates) via email that results are published."""
    try:
        from app.db.session import SessionLocal
        async with SessionLocal() as db:
            # Fetch all voters
            result = await db.execute(select(Voter))
            voters = result.scalars().all()
            
            results_url = "http://localhost:8080/voter/dashboard"
            
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
                            The results for <strong>{election_title}</strong> are officially out!
                        </p>
                        <p style="color: #374151; font-size: 15px; line-height: 1.5;">
                            You can view the detailed results and winners on the portal dashboard:
                        </p>
                        <div style="text-align: center; margin: 24px 0;">
                            <a href="{results_url}" style="background: #6c63ff; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">
                                Check Election Results
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
    result = await db.execute(select(Election).order_by(Election.created_at.desc()))
    election = result.scalars().first()
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
    result = await db.execute(select(Election).order_by(Election.created_at.desc()))
    election = result.scalars().first()
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
    result = await db.execute(select(Election).order_by(Election.created_at.desc()))
    election = result.scalars().first()
    
    notifications = []
    if election:
        current_phase = PhaseEngine.get_current_phase(election)
        time_rem = PhaseEngine.get_time_remaining(election, current_phase)
        
        if current_phase == "registration_open":
            notifications.append({"id": 1, "title": f"Registration closes in {time_rem}", "time": "Just now", "unread": True, "type": "announcement"})
        elif current_phase == "voting_open":
            notifications.append({"id": 1, "title": f"Voting closes in {time_rem}", "time": "Just now", "unread": True, "type": "announcement"})
        elif current_phase == "results_published":
            notifications.append({"id": 1, "title": "Results are published!", "time": "Just now", "unread": True, "type": "system"})
        else:
            notifications.append({"id": 1, "title": f"Current Phase: {current_phase.replace('_', ' ').title()}", "time": "Just now", "unread": False, "type": "system"})
            
    notifications.append({"id": 2, "title": "Welcome to the real-time election portal", "time": "1 min ago", "unread": False, "type": "system"})
    return notifications

@router.post("/{election_id}/announce")
async def announce_election_schedule(
    election_id: str,
    admin: dict = Depends(get_admin_user),
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
    admin: dict = Depends(get_admin_user),
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
    return {"message": "Election paused."}


@router.post("/{election_id}/resume")
async def resume_election(
    election_id: str,
    admin: dict = Depends(get_admin_user),
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
    return {"message": "Election resumed."}


@router.post("/{election_id}/emergency-stop")
async def emergency_stop_election(
    election_id: str,
    admin: dict = Depends(get_admin_user),
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
    return {"message": "Emergency stop executed. Voting closed."}


@router.post("/{election_id}/open-voting")
async def open_voting(
    election_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Start voting phase for an election and notify all participants."""
    try:
        election_uuid = uuid.UUID(election_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid election ID format")
        
    result = await db.execute(select(Election).where(Election.election_id == election_uuid))
    election = result.scalar_one_or_none()
    if not election:
        raise HTTPException(status_code=404, detail="Election not found")
        
    election.status = ElectionStatusEnum.VOTING_OPEN.value
    election.voting_start = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(election)
    
    # Notify voters in background
    asyncio.create_task(notify_voting_started(election.title))
    
    return {"message": "Voting successfully opened", "status": election.status}


@router.post("/{election_id}/close-voting")
async def close_voting(
    election_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Close voting phase for an election."""
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
    
    return {"message": "Voting successfully closed", "status": election.status}


@router.post("/{election_id}/publish-results")
async def publish_results(
    election_id: str,
    admin: dict = Depends(get_admin_user),
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
        
    election.status = ElectionStatusEnum.RESULTS_PUBLISHED.value
    
    # We can also compute final integrity hash here if needed
    # (Since we are publishing, we lock in the state)
    
    await db.commit()
    await db.refresh(election)
    
    # Notify voters in background
    asyncio.create_task(notify_results_published(election.title))
    
    return {"message": "Results successfully published", "status": election.status}


@router.put("/{election_id}")
async def update_election_dates(
    election_id: str,
    payload: ElectionSaveRequest,
    admin: dict = Depends(get_admin_user),
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
        
    # Validation checks
    if payload.registration_start and payload.registration_end:
        if payload.registration_end <= payload.registration_start:
            raise HTTPException(
                status_code=400,
                detail="Registration closes must be after registration opens."
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
            
    election.title = payload.title
    election.registration_start = payload.registration_start
    election.registration_end = payload.registration_end
    election.voting_start = payload.voting_start
    election.voting_end = payload.voting_end
    
    await db.commit()
    await db.refresh(election)
    
    return {"message": "Election details saved successfully.", "election": election}

