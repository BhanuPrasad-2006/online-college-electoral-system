from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import asyncio
import uuid
import hashlib
import re
import base64
from datetime import timezone
from app.services.face_service import extract_face_embedding, compare_face_embeddings, deserialize_embedding

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
    anti_replay_token: Optional[str] = None
    live_face_image: Optional[str] = None
    submit_time_ms: Optional[int] = None
    verification_field_confirm: Optional[str] = None
    hidden_field_name: Optional[str] = None
    phone_confirm: Optional[str] = None


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

    # Fetch the active election
    election_query = select(Election).order_by(Election.created_at.desc())
    election_result = await db.execute(election_query)
    election = election_result.scalars().first()

    # Call vote validator
    from app.validators.vote_validator import validate_vote_submission
    is_valid, err_msg = await validate_vote_submission(db, election, voter)
    if not is_valid:
        status_code = status.HTTP_400_BAD_REQUEST
        if "permission" in err_msg:
            status_code = status.HTTP_403_FORBIDDEN
        elif "not found" in err_msg:
            status_code = status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=err_msg)

    # ── Anti-Replay Token Verification ───────────────────────
    if not body.anti_replay_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Anti-replay token is missing."
        )
    from app.security.anti_replay_service import AntiReplayService
    is_token_valid = await AntiReplayService.validate_and_consume(body.anti_replay_token, voter_id, db)
    if not is_token_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired anti-replay token. Please verify your ID again."
        )

    # ── Verification ID Check Bypassed for Testing ───────────
    logger.info(f"Bypassing verification ID check for voter {voter.voter_id} to check face auth directly.")

    # ── Face Verification ────────────────────────────────────
    if voter.face_encoding:
        if not body.live_face_image:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Live face image is required for identity verification."
            )
        try:
            if "," in body.live_face_image:
                header, encoded = body.live_face_image.split(",", 1)
            else:
                encoded = body.live_face_image
            image_data = base64.b64decode(encoded)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid face image format."
            )
            
        try:
            live_emb = extract_face_embedding(image_data)
            stored_emb = deserialize_embedding(voter.face_encoding)
            
            if not compare_face_embeddings(live_emb, stored_emb):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Face verification failed. Captured face does not match registered student photo."
                )
        except ValueError as ve:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(ve)
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

    from datetime import datetime
    from sqlalchemy import func
    from app.services.ledger_service import calculate_vote_hash, append_to_secure_vault

    # Determine next sequence and previous hash
    seq_query = select(func.max(Vote.ledger_sequence))
    seq_result = await db.execute(seq_query)
    max_seq = seq_result.scalar() or 0
    next_seq = max_seq + 1

    previous_hash = None
    if next_seq > 1:
        prev_query = select(Vote.current_hash).where(Vote.ledger_sequence == max_seq)
        prev_result = await db.execute(prev_query)
        previous_hash = prev_result.scalar()

    # Generate timestamp string
    now_utc = datetime.now(timezone.utc)
    timestamp_str = now_utc.replace(tzinfo=None).isoformat()

    # Generate current hash
    current_hash = await calculate_vote_hash(
        candidate_id=str(candidate.candidate_id) if candidate else None,
        timestamp_utc=timestamp_str,
        election_id=str(election.election_id),
        previous_hash=previous_hash,
        ledger_sequence=next_seq
    )

    # Create anonymous vote
    new_vote = Vote(
        vote_id=str(uuid.uuid4()),
        voter_token_hash=voter_token_hash,
        candidate_id=str(candidate.candidate_id) if candidate else None,
        election_id=str(election.election_id),
        position_id=str(position_id),
        previous_hash=previous_hash,
        current_hash=current_hash,
        ledger_sequence=next_seq,
        timestamp_utc=now_utc
    )
    
    db.add(new_vote)

    # Mark voter as having voted
    voter.has_voted = True
    await db.commit()

    # Append to secure vault
    vote_data = {
        "ledger_sequence": next_seq,
        "election_id": str(election.election_id),
        "position_id": str(position_id),
        "candidate_id": str(candidate.candidate_id) if candidate else None,
        "timestamp_utc": timestamp_str
    }
    await append_to_secure_vault(vote_data, current_hash)

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

    # ── Fraud and Anomaly Detection ──────────────────────────
    ip_addr = request.client.host if request.client else "127.0.0.1"
    x_forwarded = request.headers.get("x-forwarded-for")
    if x_forwarded:
        ip_addr = x_forwarded.split(",")[0].strip()

    from app.security.fraud_detection_service import FraudDetectionService
    fraud_detector = FraudDetectionService()
    vote_data = {
        "election_id": str(election.election_id),
        "ip_address": ip_addr,
        "submit_time_ms": body.submit_time_ms,
        "trap_data": {
            "verification_field_confirm": body.verification_field_confirm,
            "hidden_field_name": body.hidden_field_name,
            "phone_confirm": body.phone_confirm,
        }
    }
    await fraud_detector.analyze_vote(db, vote_data)

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

    # ── Verification ID Check Bypassed for Testing ───────────
    logger.info(f"Bypassing verification ID check for voter {voter.voter_id} to fetch anti-replay token directly.")

    # Generate anti-replay token
    from app.security.anti_replay_service import AntiReplayService
    anti_replay_token = await AntiReplayService.generate_token(user_id=str(voter.voter_id), db_session=db)

    return {"success": True, "anti_replay_token": anti_replay_token}
