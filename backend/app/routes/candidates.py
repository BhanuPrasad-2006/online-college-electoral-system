import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from pydantic import BaseModel

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.candidate import Candidate
from app.models.voter import Voter
from app.models.position import Position
from app.enums.candidate_status import CandidateStatusEnum

router = APIRouter()


class CandidateStatusUpdateRequest(BaseModel):
    status: str
    admin_remarks: Optional[str] = None


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
    """List all candidates joined with voters and positions."""
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
        
        # Determine semester or year
        sem_str = "—"
        if voter and voter.year_of_study is not None:
            # Format semester nicely, e.g. 3rd year -> "6th" semester
            sem_str = f"{voter.year_of_study * 2}th"

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
            "admin_remarks": c.admin_remarks
        })
        
    return results


@router.get("/me", response_model=dict, status_code=status.HTTP_200_OK)
async def get_candidate_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the currently logged-in candidate's profile + current status."""
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
        
    # Check Candidate by candidate_id
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
        # Fallback to check by voter_id
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
        "admin_remarks": candidate.admin_remarks
    }


@router.put("/{candidate_id}/status", status_code=status.HTTP_200_OK)
async def update_candidate_status(
    candidate_id: str,
    body: CandidateStatusUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update candidate registration status and save admin remarks."""
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
        
    # Map input status (could be e.g. "Approved", "APPROVED") to DB enum format
    input_status = body.status.upper().replace(" ", "_").strip()
    
    # Validate against allowed enum members
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
