"""Vote validation — ensures election is active, user has permission, hasn't voted."""

from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.voter import Voter
from app.models.election import Election
from app.services.phase_engine import PhaseEngine
from app.enums.election_status import ElectionStatusEnum
from app.utils.logger import logger

async def validate_vote_submission(db: AsyncSession, election: Election, voter: Voter) -> tuple[bool, str]:
    """Validate vote submission requirements."""
    if not voter:
        return False, "Voter profile not found"
        
    if not voter.vote_permission:
        return False, "You do not have permission to vote yet. Please wait for admin approval."
        
    if voter.has_voted:
        return False, "You have already cast your vote."
        
    if not election:
        return False, "No election found in the system. Please contact the election admin."
        
    # Check PhaseEngine first (date-based + status fallback)
    if PhaseEngine.is_voting_allowed(election):
        return True, ""
        
    # PhaseEngine returned not allowed — but first check if paused
    if election.is_paused:
        return False, "Voting is currently paused by the election admin."

    # Check election dates directly as an extra fallback
    # This covers edge cases where the election status hasn't been updated to VOTING_OPEN
    # but the dates clearly indicate voting should be open.
    now = datetime.now(timezone.utc)
    if election.voting_start and election.voting_end:
        vs = election.voting_start
        ve = election.voting_end
        # Normalize to UTC-naive like PhaseEngine does
        if vs.tzinfo is not None:
            vs = vs.astimezone(timezone.utc).replace(tzinfo=None)
        if ve.tzinfo is not None:
            ve = ve.astimezone(timezone.utc).replace(tzinfo=None)
        now_naive = now.replace(tzinfo=None)
        if vs <= now_naive < ve:
            logger.info(
                "vote_validator_date_fallback",
                voting_start=str(vs),
                voting_end=str(ve),
                now=str(now_naive),
                election_status=election.status
            )
            return True, ""
        
    # Log details for debugging
    current_phase = PhaseEngine.get_current_phase(election)
    logger.info(
        "vote_validator_denied",
        phase=current_phase,
        status=election.status,
        voting_start=str(election.voting_start) if election.voting_start else None,
        voting_end=str(election.voting_end) if election.voting_end else None,
        is_paused=election.is_paused
    )
    
    return False, "There is no active election open for voting at this time. Please wait for the election admin to start the voting phase."
