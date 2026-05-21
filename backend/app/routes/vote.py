from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import asyncio
import uuid
import hashlib
import re
from datetime import timezone

from app.db.session import get_db
from app.api.deps import get_current_user, get_admin_user
from app.models.voter import Voter
from app.models.candidate import Candidate
from app.models.election import Election
from app.models.position import Position
from app.models.vote import Vote
from app.enums.election_status import ElectionStatusEnum
from app.services.sms_service import send_custom_sms
from app.services.email_service import send_election_email
from app.utils.logger import logger
from pydantic import BaseModel
from typing import Optional, List
from app.middleware.rate_limit import limiter

router = APIRouter()

class VoteCastRequest(BaseModel):
    candidate_id: Optional[str] = None
    verification_id: str  # Must match voter.verification_id hash in DB


@router.post("/cast")
@limiter.limit("5/minute")
async def cast_vote(
    request: Request,
    body: VoteCastRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cast a vote for a candidate securely and send SMS/email confirmations."""
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    # Fetch voter details
    query = select(Voter).where(Voter.voter_id == voter_id)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter profile not found")

    if not voter.vote_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to vote yet. Please wait for admin approval."
        )

    if voter.has_voted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already cast your vote."
        )

    # ── Verification ID Check (bcrypt hashed) ────────────────
    if not voter.verification_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your Verification ID has not been configured. Contact election admin."
        )

    v_id = body.verification_id.strip()
    if not re.match(r"^[A-Z0-9]{8}$", v_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Verification ID"
        )

    from app.security.password_service import verify_password
    if not verify_password(v_id, voter.verification_id):
        # Audit failed verification attempts
        logger.warning(f"Failed vote cast verification attempt for voter {voter.voter_id} (email: {voter.college_email})")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Verification ID"
        )

    # Fetch the active election
    election_query = select(Election).where(Election.status == ElectionStatusEnum.VOTING_OPEN.value)
    election_result = await db.execute(election_query)
    election = election_result.scalar_one_or_none()
    if not election:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="There is no active election open for voting at this time."
        )

    candidate = None
    position_id = None
    
    if body.candidate_id:
        try:
            cand_uuid = uuid.UUID(body.candidate_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid candidate ID format")

        candidate_query = select(Candidate).where(Candidate.candidate_id == cand_uuid)
        cand_result = await db.execute(candidate_query)
        candidate = cand_result.scalar_one_or_none()
        if not candidate:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Selected candidate not found")

        # Verify candidate belongs to the active election
        if str(candidate.election_id) != str(election.election_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Selected candidate does not belong to the active election."
            )
        
        position_id = candidate.position_id
    else:
        # Voted NOTA. Fetch the President position ID for the active election
        pos_query = select(Position).where(
            Position.election_id == election.election_id,
            Position.title == "President"
        )
        pos_result = await db.execute(pos_query)
        position_record = pos_result.scalar_one_or_none()
        if not position_record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="President position not found in this election."
            )
        position_id = position_record.position_id

    # Generate cryptographic anonymous token hash
    random_token = str(uuid.uuid4())
    voter_token_hash = hashlib.sha256(random_token.encode("utf-8")).hexdigest()

    # Create anonymous vote
    new_vote = Vote(
        vote_id=str(uuid.uuid4()),
        voter_token_hash=voter_token_hash,
        candidate_id=str(candidate.candidate_id) if candidate else None,
        election_id=str(election.election_id),
        position_id=str(position_id)
    )
    
    db.add(new_vote)

    # Mark voter as having voted
    voter.has_voted = True
    await db.commit()

    # Trigger custom SMS confirmation
    if voter.mobile_number:
        try:
            msg = f"Thank you {voter.full_name} for voting in the Student Council Election! Your vote has been recorded securely. Results will be announced soon. -ELCVOT"
            asyncio.create_task(send_custom_sms(voter.mobile_number, msg))
        except Exception:
            pass

    # Trigger custom Email confirmation
    if voter.college_email:
        try:
            voted_at_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            email_body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 24px;">
                <div style="background: #10b981; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h2 style="color: white; margin: 0;">🗳️ Vote Registered Successfully</h2>
                </div>
                <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
                    <p style="color: #374151; font-size: 16px;">Hi <strong>{voter.full_name}</strong>,</p>
                    <p style="color: #374151; font-size: 15px; line-height: 1.5;">
                        Your vote in <strong>{election.title}</strong> has been successfully cast and registered.
                    </p>
                    <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 12px; margin: 20px 0; border-radius: 0 4px 4px 0;">
                        <p style="color: #065f46; margin: 0; font-size: 14px; font-weight: bold;">
                            Status: Vote Registered ✓
                        </p>
                        <p style="color: #047857; margin: 4px 0 0 0; font-size: 12px;">
                            Cast on: {voted_at_str} UTC
                        </p>
                    </div>
                    <p style="color: #6b7280; font-size: 13px; line-height: 1.4;">
                        🔒 To protect your privacy, there is no link in the database between your student identity and the candidate you voted for. Your vote is anonymous.
                    </p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                    <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                        Thank you for participating in the electoral process.
                    </p>
                </div>
            </body>
            </html>
            """
            
            asyncio.create_task(
                send_election_email(
                    to_email=voter.college_email,
                    recipient_name=voter.full_name,
                    subject=f"Vote Successfully Registered - {election.title}",
                    html_body=email_body
                )
            )
        except Exception as e:
            logger.error(f"Failed to send vote confirmation email: {e}")

    return {
        "message": "Vote successfully cast!",
        "has_voted": True
    }


@router.get("/status")
async def vote_status(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Check whether the current user has already voted."""
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    query = select(Voter).where(Voter.voter_id == voter_id)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter not found")

    return {
        "has_voted": voter.has_voted,
        "vote_permission": voter.vote_permission
    }


class VoterPermissionUpdateRequest(BaseModel):
    vote_permission: bool


@router.get("/admin/voters", response_model=List[dict])
async def list_voters_for_admin(
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve all voters in the system for admin permission management."""
    query = select(Voter).order_by(Voter.created_at.desc())
    result = await db.execute(query)
    voters = result.scalars().all()
    
    return [
        {
            "voter_id": str(v.voter_id),
            "verification_code": v.verification_code or "—",
            "student_id": v.student_id or "—",
            "full_name": v.full_name,
            "college_email": v.college_email,
            "department": v.department or "—",
            "year_of_study": v.year_of_study or 1,
            "is_verified": v.is_verified,
            "has_voted": v.has_voted,
            "vote_permission": v.vote_permission,
            "verification_id_set": v.verification_id is not None
        }
        for v in voters
    ]


@router.put("/admin/voters/{voter_id}/permission")
async def update_voter_permission(
    voter_id: str,
    body: VoterPermissionUpdateRequest,
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Grant or revoke a voter's permission to cast a vote."""
    try:
        voter_uuid = uuid.UUID(voter_id)
    except ValueError:
        try:
            import uuid as uuid_lib
            voter_uuid = uuid_lib.UUID(voter_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid voter UUID format")

    query = select(Voter).where(Voter.voter_id == voter_uuid)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise HTTPException(status_code=404, detail="Voter not found")

    voter.vote_permission = body.vote_permission
    await db.commit()

    return {
        "message": f"Voting permission successfully {'granted' if body.vote_permission else 'revoked'} for {voter.full_name}",
        "voter_id": str(voter.voter_id),
        "vote_permission": voter.vote_permission
    }


# ── Set / Update Verification Code (Admin only) ────────────────
class VoterVerificationCodeRequest(BaseModel):
    verification_code: str


@router.put("/admin/voters/{voter_id}/verification-code")
async def set_voter_verification_code(
    voter_id: str,
    body: VoterVerificationCodeRequest,
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Set or update the private verification ID for a voter.
    This ID is given to the voter privately (e.g. printed on their ID card)
    and must be entered before they can cast a vote.
    """
    try:
        voter_uuid = uuid.UUID(voter_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid voter UUID format")

    query = select(Voter).where(Voter.voter_id == voter_uuid)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise HTTPException(status_code=404, detail="Voter not found")

    code = body.verification_code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="Verification ID cannot be empty.")
    
    if not re.match(r"^[A-Z0-9]{8}$", code):
        raise HTTPException(
            status_code=400,
            detail="Verification ID must be exactly 8 uppercase alphanumeric characters."
        )

    from app.security.password_service import hash_password
    voter.verification_id = hash_password(code)
    await db.commit()

    return {
        "message": f"Verification ID set successfully for {voter.full_name}",
        "voter_id": str(voter.voter_id),
        "verification_id_set": True
    }


# ── Verify Verification ID (Voter only) ────────────────
class VerifyIdRequest(BaseModel):
    verification_id: str


@router.post("/verify-id")
@limiter.limit("5/minute")
async def verify_voter_id(
    request: Request,
    body: VerifyIdRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify the voter's 8-character verification ID against the bcrypt hash in the DB."""
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    query = select(Voter).where(Voter.voter_id == voter_id)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter profile not found")

    if voter.has_voted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already cast your vote."
        )

    if not voter.verification_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your Verification ID has not been configured. Contact election admin."
        )

    code = body.verification_id.strip()
    if not re.match(r"^[A-Z0-9]{8}$", code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Verification ID"
        )

    from app.security.password_service import verify_password
    if not verify_password(code, voter.verification_id):
        # Audit failed verification attempts
        logger.warning(f"Failed verification attempt for voter {voter.voter_id} (email: {voter.college_email})")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Verification ID"
        )

    return {"success": True}
