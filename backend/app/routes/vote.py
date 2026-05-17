from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import asyncio

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.voter import Voter
from app.services.sms_service import send_custom_sms
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class VoteCastRequest(BaseModel):
    candidate_id: Optional[str] = None


@router.post("/cast")
async def cast_vote(
    body: VoteCastRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cast a vote for a candidate securely and send SMS confirmation."""
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    # Fetch voter details
    query = select(Voter).where(Voter.voter_id == voter_id)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter profile not found")

    if voter.has_voted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already cast your vote in this election."
        )

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
        "has_voted": voter.has_voted
    }
