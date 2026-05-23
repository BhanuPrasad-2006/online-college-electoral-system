"""Vote validation — ensures election is active, user has permission, hasn't voted."""

from sqlalchemy.ext.asyncio import AsyncSession
from app.models.voter import Voter
from app.models.election import Election
from app.services.phase_engine import PhaseEngine

async def validate_vote_submission(db: AsyncSession, election: Election, voter: Voter) -> tuple[bool, str]:
    """Validate vote submission requirements."""
    if not voter:
        return False, "Voter profile not found"
        
    if not voter.vote_permission:
        return False, "You do not have permission to vote yet. Please wait for admin approval."
        
    if voter.has_voted:
        return False, "You have already cast your vote."
        
    if not election or not PhaseEngine.is_voting_allowed(election):
        return False, "There is no active election open for voting at this time."
        
    return True, ""
