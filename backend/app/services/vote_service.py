"""Vote service — handles secure vote submission with hash chain integrity."""

from sqlalchemy.orm import Session


class VoteService:
    def __init__(self, db: Session):
        self.db = db

    async def submit_vote(self, election_id: str, candidate_id: str, position: str, jit_token: str):
        """Submit a vote with hash chain integrity."""
        # TODO: Validate JIT token
        # TODO: Generate vote hash (candidate_id + position + timestamp + previous_hash)
        # TODO: Generate receipt hash for voter
        # TODO: Store vote without voter_id
        # TODO: Mark voter as having voted (separate table)
        pass

    async def verify_receipt(self, receipt_hash: str) -> bool:
        """Verify a vote receipt hash exists in the chain."""
        # TODO: Look up receipt in database
        pass

    async def get_results(self, election_id: str):
        """Get vote counts per candidate per position."""
        # TODO: Aggregate vote counts
        pass
