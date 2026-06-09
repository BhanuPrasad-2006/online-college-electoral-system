import uuid
import os
import html
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload
from pydantic import BaseModel
import jwt
from datetime import datetime, timezone, timedelta

from app.core.config import settings
from app.db.session import get_db
from app.api.deps import get_current_user, get_candidate_user, get_admin_user, require_admin_roles
from app.enums.roles import UserRoleEnum
from app.enums.manifesto_status import ManifestoStatusEnum
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
from app.services.ai_proxy_service import AIProxyService
from app.services.supabase_storage import (
    SupabaseStorageError,
    upload_manifesto_media,
)
from app.utils.image_validator import validate_image
from app.services.result_service import ResultService
from app.services.pdf_service import PDFService

router = APIRouter()

ai_proxy = AIProxyService()

async def get_manifesto_analysis_safe(content: str) -> dict:
    """Analyze a candidate's manifesto via AI proxy, returning a safe default on failure."""
    if not content or not content.strip():
        return {
            "sentiment_score": 0.5,
            "feasibility_score": 0.5,
            "key_themes": ["General"],
            "summary": "",
            "contradictions": [],
            "impact_statements": []
        }
    try:
        return await ai_proxy.analyze_manifesto(content)
    except Exception as e:
        logger.error(f"Failed to analyze manifesto via AI microservice: {e}")
        return {
            "sentiment_score": 0.5,
            "feasibility_score": 0.5,
            "key_themes": ["General"],
            "summary": "AI Analysis temporarily unavailable due to system issues.",
            "contradictions": [],
            "impact_statements": []
        }



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
    manifesto: Optional[str] = None
    payment_screenshot_url: Optional[str] = None
    mobile_number: str
    new_password: Optional[str] = None
    full_name: Optional[str] = None
    department: Optional[str] = None
    student_id: Optional[str] = None


class ManifestoUpdateRequest(BaseModel):
    manifesto: str
    submit: Optional[bool] = False
    image_url: Optional[str] = None


class ManifestoReviewRequest(BaseModel):
    status: str
    admin_remarks: Optional[str] = None


class AnalyzeManifestoRequest(BaseModel):
    content: str


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


def _manifesto_status_raw(manifesto: Manifesto | None) -> str:
    if not manifesto or not manifesto.status:
        return "none"
    raw = manifesto.status.value if hasattr(manifesto.status, "value") else str(manifesto.status)
    return raw.lower().strip()


def map_manifesto_status_to_frontend(status: str) -> str:
    return {
        "draft": "Draft",
        "pending": "Pending Review",
        "approved": "Approved",
        "rejected": "Rejected",
        "none": "Not Submitted",
    }.get(status, "Draft")


def _manifesto_content_for_role(manifesto: Manifesto | None, hide_from_voters: bool) -> str:
    if not manifesto:
        return ""
    if hide_from_voters and _manifesto_status_raw(manifesto) != ManifestoStatusEnum.APPROVED.value:
        return ""
    return manifesto.content or ""


@router.get("/", response_model=List[dict], status_code=status.HTTP_200_OK)
async def list_candidates(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List candidates. Voters only see approved candidates from the active election."""
    is_admin = current_user.get("role") == UserRoleEnum.ADMIN.value
    
    # Get active election if not admin
    active_election_id = None
    if not is_admin:
        elec_res = await db.execute(select(Election).where(Election.status == ElectionStatusEnum.VOTING_OPEN).limit(1))
        active_election = elec_res.scalar_one_or_none()
        if active_election:
            active_election_id = active_election.election_id
        else:
            return []

    query = (
        select(Candidate)
        .options(
            joinedload(Candidate.voter),
            joinedload(Candidate.position)
        )
    )
    
    if active_election_id:
        query = query.where(Candidate.election_id == active_election_id)
        
    res = await db.execute(query)
    candidates = res.scalars().all()

    cand_ids = [c.candidate_id for c in candidates]
    manifesto_map: dict = {}
    if cand_ids:
        man_res = await db.execute(
            select(Manifesto).where(Manifesto.candidate_id.in_(cand_ids))
        )
        for m in man_res.scalars().all():
            manifesto_map[m.candidate_id] = m

    results = []
    for c in candidates:
        cand_status = map_db_status_to_frontend(c.status)
        if not is_admin and cand_status != "Approved":
            continue

        voter = c.voter
        position = c.position
        
        # Filter out candidates whose voter is ineligible (1st/2nd year) — only for non-admins
        if voter and voter.year_of_study in [1, 2] and not is_admin:
            continue
        
        sem_str = "—"
        if voter and voter.year_of_study is not None:
            sem_str = f"{voter.year_of_study * 2}th"

        manifesto = manifesto_map.get(c.candidate_id)
        man_status = _manifesto_status_raw(manifesto)

        # Parse stored AI analysis if available, otherwise use safe defaults
        analysis = {}
        contradictions = []
        if manifesto and manifesto.ai_analysis:
            import json
            try:
                analysis = json.loads(manifesto.ai_analysis)
                if not isinstance(analysis, dict):
                    analysis = {}
            except Exception:
                analysis = {}

        if not analysis:
            analysis = {
                "sentiment_score": 0.5,
                "feasibility_score": 0.5,
                "key_themes": ["General"],
                "summary": "AI Analysis not yet available.",
                "contradictions": [],
                "impact_statements": []
            }

        # Safely parse contradictions for response
        raw = analysis.get("contradictions", [])
        if isinstance(raw, list):
            contradictions = [
                {
                    "statement_a": c_item.get("statement_a") or c_item.get("promise_a") or "",
                    "statement_b": c_item.get("statement_b") or c_item.get("promise_b") or "",
                    "explanation": c_item.get("explanation") or "",
                    "severity": c_item.get("severity") or "minor",
                }
                for c_item in raw
                if isinstance(c_item, dict)
            ]

        results.append({
            "candidate_id": str(c.candidate_id),
            "full_name": voter.full_name if voter else "—",
            "college_email": voter.college_email if voter else "—",
            "department": voter.department if voter else "—",
            "semester": sem_str,
            "position": position.title if position else "—",
            "status": cand_status,
            "mobile_number": c.mobile_number or (voter.mobile_number if voter else "—"),
            "applied_at": c.applied_at.isoformat() if c.applied_at else None,
            "admin_remarks": c.admin_remarks,
            "manifesto": _manifesto_content_for_role(manifesto, hide_from_voters=not is_admin),
            "manifesto_status": map_manifesto_status_to_frontend(man_status),
            "manifesto_image_url": manifesto.image_url if manifesto and _manifesto_status_raw(manifesto) == ManifestoStatusEnum.APPROVED.value else None,
            # AI analysis fields
            "sentiment_score": analysis.get("sentiment_score", 0.5),
            "feasibility_score": analysis.get("feasibility_score", 0.5),
            "key_themes": analysis.get("key_themes", []),
            "summary": analysis.get("summary", ""),
            "contradictions": analysis.get("contradictions", contradictions),
            "impact_statements": analysis.get("impact_statements", [])
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
        "student_id": voter.student_id or "",
        "mobile_number": voter.mobile_number or ""
    }


@router.get("/positions", response_model=List[dict], status_code=status.HTTP_200_OK)
async def list_positions(db: AsyncSession = Depends(get_db)):
    """Return election positions from the active election where nomination is open."""
    # Get the latest election
    elec_res = await db.execute(select(Election).order_by(Election.created_at.desc()))
    election = elec_res.scalars().first()

    if not election:
        return []

    # Only return positions if registration is open or upcoming (so candidates can see what's available)
    current_phase = PhaseEngine.get_current_phase(election)
    if current_phase not in ["pre_registration", "registration_open", "registration_closed"]:
        return []

    res = await db.execute(
        select(Position).where(Position.election_id == election.election_id)
    )
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

    # Validate position belongs to the active election
    import re
    pos_uuid = uuid.UUID(body.position_id)
    pos_res = await db.execute(
        select(Position).where(
            Position.position_id == pos_uuid,
            Position.election_id == election.election_id
        )
    )
    position = pos_res.scalar_one_or_none()
    if not position:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The selected position is not part of the active election. Please select a valid position."
        )
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

    # Check department-specific election eligibility
    if election.eligible_department:
        _dept = (voter.department or "").strip().lower()
        if _dept != election.eligible_department.strip().lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This election is restricted to the {election.eligible_department} department only."
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

    # Create candidate in PENDING status
    candidate = Candidate(
        voter_id=voter_uuid,
        election_id=position.election_id,
        position_id=pos_uuid,
        mobile_number=html.escape(body.mobile_number.strip()) if body.mobile_number else None,
        mobile_verified=True,
        status=CandidateStatusEnum.PENDING.value,
        admin_remarks=None
    )
    db.add(candidate)
    await db.flush()

    # Save manifesto if content is provided
    if body.manifesto:
        analysis = await get_manifesto_analysis_safe(body.manifesto)
        contradictions = analysis.get("contradictions", [])
        if contradictions:
            explanation_parts = []
            for idx, c_item in enumerate(contradictions):
                if isinstance(c_item, dict):
                    p_a = c_item.get("promise_a", "")
                    p_b = c_item.get("promise_b", "")
                    exp = c_item.get("explanation", "")
                    explanation_parts.append(f"'{p_a}' conflicts with '{p_b}'. {exp}")
                else:
                    explanation_parts.append(str(c_item))
            
            full_explanation = " ".join(explanation_parts)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Your manifesto contains conflicting promises. {full_explanation} Please adjust your platform."
            )

        manifesto_record = Manifesto(
            candidate_id=candidate.candidate_id,
            election_id=position.election_id,
            content=html.escape(body.manifesto.strip()),
            status=ManifestoStatusEnum.PENDING.value,
        )
        db.add(manifesto_record)


    # 4. Create Audit Log
    from app.models.audit_log import AuditLog
    audit_entry = AuditLog(
        event_type="CANDIDATE_APPLIED",
        actor_id=voter_uuid,
        description=f"Candidate {voter.full_name} registered for position {position.title}",
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

    # Parse stored AI analysis if available, otherwise use safe defaults
    analysis = {}
    if manifesto and manifesto.ai_analysis:
        import json
        try:
            analysis = json.loads(manifesto.ai_analysis)
            if not isinstance(analysis, dict):
                analysis = {}
        except Exception:
            analysis = {}

    if not analysis:
        analysis = {
            "sentiment_score": 0.5,
            "feasibility_score": 0.5,
            "key_themes": ["General"],
            "summary": "AI Analysis not yet available.",
            "contradictions": [],
            "impact_statements": []
        }

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
        "admin_remarks": candidate.admin_remarks,            "manifesto": manifesto.content if manifesto else "",
        # AI analysis fields
        "sentiment_score": analysis.get("sentiment_score", 0.5),
        "feasibility_score": analysis.get("feasibility_score", 0.5),
        "key_themes": analysis.get("key_themes", []),
        "summary": analysis.get("summary", ""),
        "contradictions": analysis.get("contradictions", []),
        "impact_statements": analysis.get("impact_statements", []),
        "manifesto_image_url": manifesto.image_url if manifesto else None,
        "manifesto_status": map_manifesto_status_to_frontend(_manifesto_status_raw(manifesto)),
        "manifesto_admin_remarks": manifesto.admin_remarks if manifesto else None,
        # Party architecture fields
        "candidate_type": getattr(candidate, "candidate_type", "INDEPENDENT") or "INDEPENDENT",
        "party_id": str(candidate.party_id) if getattr(candidate, "party_id", None) else None,
        "party_role": getattr(candidate, "party_role", None),
    }


@router.get("/me/report/pdf")
async def download_candidate_report(
    current_user: dict = Depends(get_candidate_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate and download a PDF report for the candidate."""
    user_id_str = current_user.get("user_id")
    if not user_id_str:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid UUID")

    # Fetch candidate
    cand_res = await db.execute(
        select(Candidate)
        .options(joinedload(Candidate.voter), joinedload(Candidate.position))
        .where((Candidate.voter_id == user_uuid) | (Candidate.candidate_id == user_uuid))
    )
    candidate = cand_res.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    # Check election phase
    election_id = str(candidate.election_id)
    elec_res = await db.execute(select(Election).where(Election.election_id == candidate.election_id))
    election = elec_res.scalar_one_or_none()
    
    if not election:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Election not found")
        
    current_phase = PhaseEngine.get_current_phase(election)
    if current_phase != "results_announced":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Results are not published yet.")

    # Get results
    result_service = ResultService(db)
    result_data = await result_service.get_candidate_result(election_id, str(candidate.candidate_id))
    
    if not result_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result data not found")

    # Fetch manifesto for summary
    man_query = select(Manifesto).where(Manifesto.candidate_id == candidate.candidate_id)
    man_res = await db.execute(man_query)
    manifesto = man_res.scalars().first()
    
    ai_summary = ""
    manifesto_text = ""
    if manifesto:
        manifesto_text = manifesto.content or ""
        if manifesto.ai_analysis:
            import json
            try:
                analysis = json.loads(manifesto.ai_analysis)
                ai_summary = analysis.get("summary", "")
            except Exception:
                pass

    pdf_buffer = PDFService.generate_candidate_report(
        candidate_name=candidate.voter.full_name if candidate.voter else "Unknown",
        department=candidate.voter.department if candidate.voter else "Unknown",
        position_title=candidate.position.title if candidate.position else "Unknown",
        election_title=election.title,
        vote_count=result_data["vote_count"],
        total_position_votes=result_data["total_position_votes"],
        vote_percentage=result_data["vote_percentage"],
        rank=result_data["rank"],
        winner_status=result_data["winner_status"],
        ai_summary=ai_summary,
        manifesto_text=manifesto_text
    )

    filename = f"Election_Report_{candidate.voter.full_name.replace(' ', '_')}.pdf"
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
# ── Manifesto file upload constants ────────────────────────
MAX_MANIFESTO_FILE_SIZE = 10 * 1024 * 1024

ALLOWED_MANIFESTO_MIMETYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
}

ALLOWED_MANIFESTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"}


@router.post("/me/manifesto/upload", status_code=status.HTTP_200_OK)
async def upload_manifesto_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_candidate_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a manifesto image/PDF to Supabase Storage.
    Returns the public URL to include when saving the manifesto.
    """
    user_id_str = current_user.get("user_id")
    if not user_id_str:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    # Resolve candidate_id
    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid UUID format")

    cand_res = await db.execute(select(Candidate).where(Candidate.voter_id == user_uuid))
    candidate = cand_res.scalar_one_or_none()
    if not candidate:
        cand_res = await db.execute(select(Candidate).where(Candidate.candidate_id == user_uuid))
        candidate = cand_res.scalar_one_or_none()

    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate profile not found")

    # Phase Lock Check (Manifesto Deadline)
    elec_res = await db.execute(select(Election).order_by(Election.created_at.desc()))
    election = elec_res.scalars().first()
    if election:
        phase = PhaseEngine.get_current_phase(election)
        if phase in ["campaign_period", "voting_open", "voting_closed", "results_announced"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Manifesto submissions and edits are locked after the manifesto deadline."
            )

    candidate_id = str(candidate.candidate_id)

    # Validate file presence
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided.",
        )

    # Validate extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_MANIFESTO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file extension '{ext}'. Allowed: {', '.join(sorted(ALLOWED_MANIFESTO_EXTENSIONS))}",
        )

    # Validate MIME type
    if file.content_type not in ALLOWED_MANIFESTO_MIMETYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type '{file.content_type}'. Allowed images (JPEG, PNG, GIF, WebP) and PDF.",
        )

    # Read file data
    file_data = await file.read()

    # Multi-layer file upload validation via centralized validator
    from app.validators.file_upload_validator import validate_image_upload, validate_document_upload

    is_pdf = file.content_type == "application/pdf"
    if is_pdf:
        validation_result = validate_document_upload(
            data=file_data,
            filename=file.filename or "",
            content_type=file.content_type or "",
            max_size_bytes=MAX_MANIFESTO_FILE_SIZE,
        )
    else:
        validation_result = validate_image_upload(
            data=file_data,
            filename=file.filename or "",
            content_type=file.content_type or "",
            max_size_bytes=MAX_MANIFESTO_FILE_SIZE,
        )

    if not validation_result.passed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=validation_result.reason,
        )

    # Validate image content (block AI-generated or malicious images)
    if file.content_type and file.content_type.startswith("image/"):
        validation = validate_image(file_data, file.filename)
        if not validation.passed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=validation.reason,
            )

    # Upload to Supabase (or local fallback)
    supabase_enabled = bool(settings.supabase_project_url and settings.SUPABASE_SERVICE_ROLE_KEY)
    if supabase_enabled:
        try:
            uploaded = await upload_manifesto_media(
                candidate_id=candidate_id,
                filename=file.filename,
                content_type=file.content_type,
                data=file_data,
            )
            return {"url": uploaded.public_url, "path": uploaded.path}
        except SupabaseStorageError as exc:
            logger.error(f"Supabase manifesto upload failed: {exc}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to upload file. Please try again.",
            )
    else:
        # Local fallback for development
        upload_dir = "uploads/manifestos"
        os.makedirs(upload_dir, exist_ok=True)
        unique_name = f"{uuid.uuid4().hex}{ext}"
        file_path = os.path.join(upload_dir, unique_name)
        try:
            with open(file_path, "wb") as f:
                f.write(file_data)
            local_url = f"/{upload_dir}/{unique_name}"
            return {"url": local_url, "path": local_url}
        except Exception as e:
            logger.error(f"Failed to save manifesto file locally: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save uploaded file.",
            )


@router.put("/me/manifesto", status_code=status.HTTP_200_OK)
async def update_my_manifesto(
    body: ManifestoUpdateRequest,
    current_user: dict = Depends(get_candidate_user),
    db: AsyncSession = Depends(get_db),
):
    """Save or submit manifesto for admin review."""
    user_id_str = current_user.get("user_id")
    if not user_id_str:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid UUID format")

    cand_res = await db.execute(select(Candidate).where(Candidate.voter_id == user_uuid))
    candidate = cand_res.scalar_one_or_none()
    if not candidate:
        cand_res = await db.execute(select(Candidate).where(Candidate.candidate_id == user_uuid))
        candidate = cand_res.scalar_one_or_none()

    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate profile not found")

    # Phase Lock Check (Manifesto Deadline)
    elec_res = await db.execute(select(Election).order_by(Election.created_at.desc()))
    election = elec_res.scalars().first()
    if election:
        phase = PhaseEngine.get_current_phase(election)
        if phase in ["campaign_period", "voting_open", "voting_closed", "results_announced"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Manifesto submissions and edits are locked after the manifesto deadline."
            )

    cand_status = map_db_status_to_frontend(candidate.status)
    if body.submit and cand_status != "Approved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your candidate application must be approved before submitting a manifesto for review.",
        )

    if not (body.manifesto or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Manifesto cannot be empty.")

    pos_res = await db.execute(select(Position).where(Position.position_id == candidate.position_id))
    position = pos_res.scalar_one_or_none()
    if not position:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Candidate position not found")

    clean = html.escape((body.manifesto or "").strip())

    man_res = await db.execute(select(Manifesto).where(Manifesto.candidate_id == candidate.candidate_id))
    manifesto = man_res.scalars().first()
    new_status = ManifestoStatusEnum.PENDING.value if body.submit else ManifestoStatusEnum.DRAFT.value

    if manifesto:
        manifesto.content = clean
        manifesto.version = (manifesto.version or 1) + 1
        manifesto.status = new_status
        if body.image_url is not None:
            manifesto.image_url = body.image_url or None
        if body.submit:
            manifesto.submitted_at = datetime.now(timezone.utc)
            manifesto.admin_remarks = None
            manifesto.reviewed_at = None
    else:
        manifesto = Manifesto(
            candidate_id=candidate.candidate_id,
            election_id=position.election_id,
            content=clean,
            image_url=body.image_url,
            version=1,
            status=new_status,
            submitted_at=datetime.now(timezone.utc) if body.submit else None,
        )
        db.add(manifesto)

    await db.commit()
    await db.refresh(manifesto)

    if body.submit:
        # ── Auto-analyze manifesto for contradictions on submission ──────────
        try:
            from app.services.ai_proxy_service import AIProxyService
            proxy = AIProxyService()
            analysis = await proxy.analyze_manifesto(clean)
            import json
            manifesto.ai_analysis = json.dumps(analysis)
            db.add(manifesto)
            await db.commit()
        except Exception as exc:
            # Non-blocking — don't fail submission if analysis fails
            from app.utils.logger import logger as __log
            __log.warning(f"Auto-analysis failed for manifesto {manifesto.manifesto_id}: {exc}")
        return {
            "message": "Manifesto submitted for admin approval",
            "manifesto_status": map_manifesto_status_to_frontend(_manifesto_status_raw(manifesto)),
        }
    return {
        "message": "Manifesto draft saved",
        "manifesto_status": map_manifesto_status_to_frontend(_manifesto_status_raw(manifesto)),
    }


@router.post("/me/manifesto/analyze", status_code=status.HTTP_200_OK)
async def analyze_my_manifesto(
    body: AnalyzeManifestoRequest,
    current_user: dict = Depends(get_candidate_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Analyze the current manifesto text via AI, store the result in the database,
    and return the analysis (contradictions, feasibility, themes, etc.).
    Uses the text sent in the request body (not the saved DB content)
    so unsaved edits are included.
    """
    user_id_str = current_user.get("user_id")
    if not user_id_str:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid UUID format")

    cand_res = await db.execute(select(Candidate).where(Candidate.voter_id == user_uuid))
    candidate = cand_res.scalar_one_or_none()
    if not candidate:
        cand_res = await db.execute(select(Candidate).where(Candidate.candidate_id == user_uuid))
        candidate = cand_res.scalar_one_or_none()

    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate profile not found")

    if not (body.content or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Manifesto content cannot be empty.",
        )

    from app.services.ai_proxy_service import AIProxyService
    proxy = AIProxyService()
    try:
        import json
        analysis = await proxy.analyze_manifesto(body.content)

        # Save analysis to the candidate's manifesto record if it exists
        man_res = await db.execute(select(Manifesto).where(Manifesto.candidate_id == candidate.candidate_id))
        manifesto = man_res.scalars().first()
        if manifesto:
            manifesto.ai_analysis = json.dumps(analysis)
            db.add(manifesto)
            await db.commit()

        return analysis
    except Exception as exc:
        from app.utils.logger import logger as __log
        __log.warning(f"AI analysis failed for candidate {candidate.candidate_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI analysis failed: {str(exc)[:200]}",
        )


@router.get("/admin/manifestos", status_code=status.HTTP_200_OK)
async def list_manifestos_for_admin(
    admin: dict = Depends(require_admin_roles(["SUPER_ADMIN", "CANDIDATE_MODERATOR"])),
    db: AsyncSession = Depends(get_db),
    status_filter: Optional[str] = None,
):
    """List manifestos for admin review."""
    query = (
        select(Manifesto, Candidate, Voter, Position)
        .join(Candidate, Manifesto.candidate_id == Candidate.candidate_id)
        .join(Voter, Candidate.voter_id == Voter.voter_id)
        .join(Position, Candidate.position_id == Position.position_id)
        .order_by(Manifesto.submitted_at.desc())
    )
    if status_filter:
        query = query.where(Manifesto.status == status_filter.lower().strip())

    res = await db.execute(query)
    rows = res.all()

    items = []
    for manifesto, candidate, voter, position in rows:
        # Parse stored AI analysis
        ai_flags = {
            "contradictions": [],
            "feasibility_score": None,
            "sentiment_score": None,
            "key_themes": [],
            "summary": None,
        }
        if manifesto and manifesto.ai_analysis:
            import json
            try:
                parsed = json.loads(manifesto.ai_analysis)
                if isinstance(parsed, dict):
                    raw_c = parsed.get("contradictions", [])
                    if isinstance(raw_c, list):
                        ai_flags["contradictions"] = [
                            {
                                "statement_a": c.get("statement_a", ""),
                                "statement_b": c.get("statement_b", ""),
                                "explanation": c.get("explanation", ""),
                                "severity": c.get("severity", "minor"),
                            }
                            for c in raw_c
                            if isinstance(c, dict) and "statement_a" in c
                        ]
                    ai_flags["feasibility_score"] = parsed.get("feasibility_score")
                    ai_flags["sentiment_score"] = parsed.get("sentiment_score")
                    ai_flags["key_themes"] = parsed.get("key_themes", [])
                    ai_flags["summary"] = parsed.get("summary")
            except (json.JSONDecodeError, TypeError):
                pass

        items.append({
            "manifesto_id": str(manifesto.manifesto_id),
            "candidate_id": str(candidate.candidate_id),
            "full_name": voter.full_name if voter else "—",
            "position": position.title if position else "—",
            "department": voter.department if voter else "—",
            "candidate_status": map_db_status_to_frontend(candidate.status),
            "manifesto_status": map_manifesto_status_to_frontend(_manifesto_status_raw(manifesto)),
            "content": manifesto.content,
            "image_url": manifesto.image_url,
            "admin_remarks": manifesto.admin_remarks,
            "submitted_at": manifesto.submitted_at.isoformat() if manifesto.submitted_at else None,
            "reviewed_at": manifesto.reviewed_at.isoformat() if manifesto.reviewed_at else None,
            "ai_analysis": ai_flags,
        })
    return items


@router.put("/admin/manifestos/{manifesto_id}/review", status_code=status.HTTP_200_OK)
async def review_manifesto(
    manifesto_id: str,
    body: ManifestoReviewRequest,
    admin: dict = Depends(require_admin_roles(["SUPER_ADMIN", "CANDIDATE_MODERATOR"])),
    db: AsyncSession = Depends(get_db),
):
    """Approve or reject a candidate manifesto."""
    try:
        man_uuid = uuid.UUID(manifesto_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid manifesto ID")

    man_res = await db.execute(select(Manifesto).where(Manifesto.manifesto_id == man_uuid))
    manifesto = man_res.scalars().first()
    if not manifesto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manifesto not found")

    decision = body.status.lower().strip()
    if decision not in (ManifestoStatusEnum.APPROVED.value, ManifestoStatusEnum.REJECTED.value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be 'approved' or 'rejected'",
        )

    manifesto.status = decision
    manifesto.admin_remarks = html.escape(body.admin_remarks.strip()) if body.admin_remarks else None
    manifesto.reviewed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(manifesto)

    return {
        "message": f"Manifesto {decision}",
        "manifesto_id": str(manifesto.manifesto_id),
        "manifesto_status": map_manifesto_status_to_frontend(_manifesto_status_raw(manifesto)),
    }



@router.put("/{candidate_id}/status", status_code=status.HTTP_200_OK)
async def update_candidate_status(
    candidate_id: str,
    body: CandidateStatusUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin_roles(["SUPER_ADMIN", "CANDIDATE_MODERATOR"])),
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


class ManifestoUpdateRequest(BaseModel):
    content: str


@router.put("/manifesto", status_code=status.HTTP_200_OK)
async def update_candidate_manifesto(
    body: ManifestoUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update candidate's manifesto and check for logical contradictions."""
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

    # Verify election phase - manifesto editing allowed during registration and campaign periods
    res_elec = await db.execute(select(Election).where(Election.election_id == candidate.election_id))
    election = res_elec.scalar_one_or_none()
    if not election or not PhaseEngine.is_manifesto_edit_allowed(election):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manifesto editing is only allowed during registration and campaign periods."
        )


    # Sanitize content input
    content_clean = html.escape(body.content.strip())
    if not content_clean or len(content_clean) < 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Manifesto statement must be at least 20 characters."
        )

    # Run contradiction analysis
    analysis = await get_manifesto_analysis_safe(body.content)
    contradictions = analysis.get("contradictions", [])
    if contradictions:
        explanation_parts = []
        for idx, c_item in enumerate(contradictions):
            if isinstance(c_item, dict):
                p_a = c_item.get("promise_a", "")
                p_b = c_item.get("promise_b", "")
                exp = c_item.get("explanation", "")
                explanation_parts.append(f"'{p_a}' conflicts with '{p_b}'. {exp}")
            else:
                explanation_parts.append(str(c_item))
        
        full_explanation = " ".join(explanation_parts)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Your manifesto contains conflicting promises. {full_explanation} Please adjust your platform."
        )

    # Update or insert Manifesto record
    man_query = select(Manifesto).where(Manifesto.candidate_id == candidate.candidate_id)
    man_res = await db.execute(man_query)
    manifesto_record = man_res.scalars().first()
    
    if manifesto_record:
        manifesto_record.content = content_clean
        manifesto_record.version += 1
    else:
        manifesto_record = Manifesto(
            candidate_id=candidate.candidate_id,
            election_id=candidate.election_id,
            content=content_clean
        )
        db.add(manifesto_record)
        
    await db.commit()
    return {"message": "Manifesto updated successfully"}

