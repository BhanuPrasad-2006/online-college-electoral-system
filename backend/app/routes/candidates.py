import uuid
import html
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload
from pydantic import BaseModel
import jwt
from datetime import datetime, timezone, timedelta

from app.core.config import settings
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.voter import Voter
from app.models.position import Position
from app.models.manifesto import Manifesto
from app.models.vote import Vote
from app.enums.candidate_status import CandidateStatusEnum
from app.enums.election_status import ElectionStatusEnum
from app.enums.otp_type import OTPTypeEnum
from app.services.phase_engine import PhaseEngine
from app.services.otp_service import create_and_store_otp, verify_otp
from app.services.email_service import send_otp_email
from app.utils.logger import logger
from app.core.security import get_password_hash

router = APIRouter()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _email_equals(column, email: str):
    return func.lower(column) == _normalize_email(email)


class CandidateStatusUpdateRequest(BaseModel):
    status: str
    admin_remarks: Optional[str] = None


class EligibilityCheckRequest(BaseModel):
    email: str
    password: str


class VerifyOtpRequest(BaseModel):
    otp_session_token: str
    otp: str


class CandidateRegisterRequest(BaseModel):
    otp_session_token: str
    position_id: str
    party_name: Optional[str] = None
    party_symbol_url: Optional[str] = None
    manifesto: Optional[str] = None
    payment_screenshot_url: Optional[str] = None
    mobile_number: str
    new_password: Optional[str] = None
    full_name: Optional[str] = None
    department: Optional[str] = None
    student_id: Optional[str] = None
    vice_president: Optional[str] = None
    secretary: Optional[str] = None



def map_db_status_to_frontend(db_status) -> str:
    """Map DB status uppercase enums to frontend capitalized display text."""
    if hasattr(db_status, "value"):
        db_status = db_status.value
    status_str = str(db_status).upper().strip()
    
    mapping = {
        "PENDING": "Pending",
        "UNDER_REVIEW": "Under Review",
        "APPROVED": "Approved",
        "REJECTED": "Rejected"
    }
    return mapping.get(status_str, "Pending")


@router.get("/", response_model=List[dict], status_code=status.HTTP_200_OK)
async def list_candidates(db: AsyncSession = Depends(get_db)):
    """List all candidates joined with voters, positions, and manifestos."""
    query = (
        select(Candidate)
        .options(
            joinedload(Candidate.voter),
            joinedload(Candidate.position)
        )
    )
    res = await db.execute(query)
    candidates = res.scalars().all()
    
    results = []
    for c in candidates:
        voter = c.voter
        position = c.position
        
        sem_str = "—"
        if voter and voter.year_of_study is not None:
            sem_str = f"{voter.year_of_study * 2}th"

        # Fetch manifesto content if exists
        man_query = select(Manifesto).where(Manifesto.candidate_id == c.candidate_id)
        man_res = await db.execute(man_query)
        manifesto = man_res.scalars().first()

        results.append({
            "candidate_id": str(c.candidate_id),
            "full_name": voter.full_name if voter else "—",
            "college_email": voter.college_email if voter else "—",
            "department": voter.department if voter else "—",
            "semester": sem_str,
            "position": position.title if position else "—",
            "status": map_db_status_to_frontend(c.status),
            "mobile_number": c.mobile_number or (voter.mobile_number if voter else "—"),
            "applied_at": c.applied_at.isoformat() if c.applied_at else None,
            "admin_remarks": c.admin_remarks,
            "party_symbol_url": c.party_symbol_url,
            "vice_president": c.vice_president or "—",
            "secretary": c.secretary or "—",
            "manifesto": manifesto.content if manifesto else ""
        })
        
    return results


@router.post("/eligibility-check", status_code=status.HTTP_200_OK)
async def eligibility_check(body: EligibilityCheckRequest, db: AsyncSession = Depends(get_db)):
    """Verify voter credentials, year of study (>=3), existing candidate profile, and send OTP."""
    # 1. Fetch voter by college email
    res = await db.execute(select(Voter).where(_email_equals(Voter.college_email, body.email)))
    voter = res.scalar_one_or_none()
    if not voter:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Voter profile not found. You must be registered as a voter first."
        )

    # 2. Verify password hash
    from app.security.password_service import verify_password
    if not verify_password(body.password, voter.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid voter credentials."
        )

    # 3. Verify year eligibility (first and second year are NOT eligible)
    if voter.year_of_study in [1, 2]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="First and second-year students are not eligible to register as candidates."
        )

    # 4. Check if voter already has a candidate profile
    cand_res = await db.execute(select(Candidate).where(Candidate.voter_id == voter.voter_id))
    candidate = cand_res.scalar_one_or_none()
    if candidate:
        status_str = candidate.status.value if hasattr(candidate.status, "value") else str(candidate.status)
        if status_str == "APPROVED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You are already registered and approved as a candidate."
            )
        elif status_str in ["PENDING", "UNDER_REVIEW"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You already have a pending or under-review candidate application."
            )
        elif status_str == "REJECTED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Your candidate registration was rejected. Reason: {candidate.admin_remarks or 'No remarks provided.'}"
            )

    # 5. Generate and store OTP
    otp_record, plain_otp = await create_and_store_otp(
        db=db,
        recipient=voter.college_email,
        otp_type=OTPTypeEnum.EMAIL
    )

    # 6. Send OTP email
    await send_otp_email(
        to_email=voter.college_email,
        recipient_name=voter.full_name,
        otp=plain_otp,
        purpose="registration"
    )
    await db.commit()

    # 7. Generate temporary session token
    expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {
        "sub": str(voter.voter_id),
        "email": voter.college_email,
        "type": "candidate_eligibility_session",
        "exp": expire,
    }
    otp_session_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")

    return {
        "otp_session_token": otp_session_token,
        "message": "OTP sent to your registered college email."
    }


@router.post("/verify-eligibility-otp", status_code=status.HTTP_200_OK)
async def verify_eligibility_otp(body: VerifyOtpRequest, db: AsyncSession = Depends(get_db)):
    """Verify eligibility OTP and return voter profile details for pre-filling."""
    try:
        payload = jwt.decode(body.otp_session_token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != "candidate_eligibility_session":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP session token type.")
        voter_id_str = payload.get("sub")
        email = payload.get("email")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP session token has expired or is invalid."
        )

    voter_uuid = uuid.UUID(voter_id_str)

    # Verify OTP
    success, message = await verify_otp(
        db=db,
        recipient=email,
        plain_otp=body.otp,
        otp_type=OTPTypeEnum.EMAIL
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    res = await db.execute(select(Voter).where(Voter.voter_id == voter_uuid))
    voter = res.scalar_one_or_none()
    if not voter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter not found.")

    await db.commit()

    return {
        "verified": True,
        "full_name": voter.full_name,
        "department": voter.department or "—",
        "semester": f"{voter.year_of_study * 2}th" if voter.year_of_study else "—",
        "mobile_number": voter.mobile_number or ""
    }


@router.get("/positions", response_model=List[dict], status_code=status.HTTP_200_OK)
async def list_positions(db: AsyncSession = Depends(get_db)):
    """Return all election positions from database."""
    res = await db.execute(select(Position))
    positions = res.scalars().all()
    return [
        {
            "position_id": str(p.position_id),
            "election_id": str(p.election_id),
            "title": p.title,
            "description": p.description or ""
        }
        for p in positions
    ]


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_candidate(body: CandidateRegisterRequest, db: AsyncSession = Depends(get_db)):
    """Create a new candidate application in PENDING status."""
    
    # Block if registration phase is not open
    res_elec = await db.execute(select(Election).order_by(Election.created_at.desc()))
    election = res_elec.scalars().first()
    if not election or not PhaseEngine.is_registration_allowed(election):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Candidate registration is currently closed."
        )
    import re
    def validate_strong_password(password: str) -> bool:
        if len(password) < 8:
            return False
        if not re.search(r"[A-Z]", password):
            return False
        if not re.search(r"[a-z]", password):
            return False
        if not re.search(r"[0-9]", password):
            return False
        if not re.search(r"[@$!%*?&#_]", password):
            return False
        return True

    # 1. Enforce password validation if provided
    if body.new_password:
        if not validate_strong_password(body.new_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password is too weak. It must be at least 8 characters long and contain uppercase, lowercase, numbers, and special characters."
            )

    try:
        payload = jwt.decode(body.otp_session_token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        voter_id_str = payload.get("sub")
        if not voter_id_str:
            raise ValueError("Missing sub key")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session token expired or invalid. Please check eligibility again."
        )

    voter_uuid = uuid.UUID(voter_id_str)

    # 2. Check if voter exists
    voter_res = await db.execute(select(Voter).where(Voter.voter_id == voter_uuid))
    voter = voter_res.scalar_one_or_none()

    if not voter:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Voter profile not found. You must be registered as a voter first."
        )

    # Update voter details if they were empty and now provided
    if body.full_name:
        voter.full_name = html.escape(body.full_name.strip())
    if body.department:
        voter.department = html.escape(body.department.strip())
    if body.student_id:
        voter.student_id = html.escape(body.student_id.strip())
    if body.new_password:
        voter.password_hash = get_password_hash(body.new_password)
    db.add(voter)
    await db.flush()

    # 3. Check if candidate already exists
    cand_res = await db.execute(select(Candidate).where(Candidate.voter_id == voter_uuid))
    existing_candidate = cand_res.scalar_one_or_none()
    if existing_candidate:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Candidate record already exists.")

    # Get position details to bind election
    pos_uuid = uuid.UUID(body.position_id)
    pos_res = await db.execute(select(Position).where(Position.position_id == pos_uuid))
    position = pos_res.scalar_one_or_none()
    if not position:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Position not found.")

    # Create candidate in PENDING status
    candidate = Candidate(
        voter_id=voter_uuid,
        election_id=position.election_id,
        position_id=pos_uuid,
        mobile_number=html.escape(body.mobile_number.strip()) if body.mobile_number else None,
        mobile_verified=True,
        party_symbol_url=html.escape(body.party_symbol_url.strip()) if body.party_symbol_url else None,
        vice_president=html.escape(body.vice_president.strip()) if body.vice_president else None,
        secretary=html.escape(body.secretary.strip()) if body.secretary else None,
        status=CandidateStatusEnum.PENDING.value,
        admin_remarks=None
    )
    db.add(candidate)
    await db.flush()

    # Save manifesto if content is provided
    if body.manifesto:
        manifesto_record = Manifesto(
            candidate_id=candidate.candidate_id,
            election_id=position.election_id,
            content=html.escape(body.manifesto.strip())
        )
        db.add(manifesto_record)

    # 4. Create Audit Log
    from app.models.audit_log import AuditLog
    party_name_escaped = html.escape(body.party_name.strip()) if body.party_name else 'Independent'
    audit_entry = AuditLog(
        event_type="CANDIDATE_APPLIED",
        actor_id=voter_uuid,
        description=f"Candidate {voter.full_name} registered for position {position.title} ({party_name_escaped})",
        created_at=datetime.now(timezone.utc)
    )
    db.add(audit_entry)

    await db.commit()
    await db.refresh(candidate)

    return {
        "message": "Candidate registered successfully",
        "candidate_id": str(candidate.candidate_id),
        "status": "PENDING"
    }


@router.get("/me", response_model=dict, status_code=status.HTTP_200_OK)
async def get_candidate_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get currently logged-in candidate's profile."""
    user_id_str = current_user.get("user_id")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized"
        )
        
    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid UUID format"
        )
        
    query = (
        select(Candidate)
        .options(
            joinedload(Candidate.voter),
            joinedload(Candidate.position)
        )
        .where(Candidate.candidate_id == user_uuid)
    )
    res = await db.execute(query)
    candidate = res.scalar_one_or_none()
    
    if not candidate:
        query = (
            select(Candidate)
            .options(
                joinedload(Candidate.voter),
                joinedload(Candidate.position)
            )
            .where(Candidate.voter_id == user_uuid)
        )
        res = await db.execute(query)
        candidate = res.scalar_one_or_none()
        
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate profile not found"
        )
        
    voter = candidate.voter
    position = candidate.position
    
    # Fetch manifesto content
    man_query = select(Manifesto).where(Manifesto.candidate_id == candidate.candidate_id)
    man_res = await db.execute(man_query)
    manifesto = man_res.scalars().first()

    return {
        "candidate_id": str(candidate.candidate_id),
        "full_name": voter.full_name if voter else "—",
        "college_email": voter.college_email if voter else "—",
        "department": voter.department or "—",
        "semester": f"{voter.year_of_study * 2}th" if voter and voter.year_of_study else "—",
        "position": position.title if position else "—",
        "status": map_db_status_to_frontend(candidate.status),
        "mobile_number": candidate.mobile_number or (voter.mobile_number if voter else "—"),
        "applied_at": candidate.applied_at.isoformat() if candidate.applied_at else None,
        "admin_remarks": candidate.admin_remarks,
        "party_symbol_url": candidate.party_symbol_url,
        "vice_president": candidate.vice_president or "—",
        "secretary": candidate.secretary or "—",
        "manifesto": manifesto.content if manifesto else ""
    }


@router.put("/{candidate_id}/status", status_code=status.HTTP_200_OK)
async def update_candidate_status(
    candidate_id: str,
    body: CandidateStatusUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update candidate status and remarks."""
    try:
        cand_uuid = uuid.UUID(candidate_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid candidate UUID format"
        )
        
    query = select(Candidate).where(Candidate.candidate_id == cand_uuid)
    res = await db.execute(query)
    candidate = res.scalar_one_or_none()
    
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found"
        )
        
    input_status = body.status.upper().replace(" ", "_").strip()
    
    allowed_statuses = ["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED"]
    if input_status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status: {body.status}. Allowed values: {allowed_statuses}"
        )
        
    candidate.status = CandidateStatusEnum[input_status].value
    if body.admin_remarks is not None:
        candidate.admin_remarks = body.admin_remarks
        
    await db.commit()
    return {
        "message": "Candidate status updated successfully",
        "candidate_id": str(candidate.candidate_id),
        "status": map_db_status_to_frontend(candidate.status)
    }
