"""Candidate service — manages candidate applications and approvals."""

from sqlalchemy.orm import Session


class CandidateService:
    def __init__(self, db: Session):
        self.db = db

    async def apply(self, user_id: str, election_id: str, position: str, statement: str):
        """Submit a candidate application."""
        # TODO: Check if user already applied
        # TODO: Create candidate record
        pass

    async def approve(self, candidate_id: str, admin_id: str):
        """Approve a candidate application."""
        # TODO: Update status to approved
        # TODO: Log audit event
        pass

    async def reject(self, candidate_id: str, admin_id: str, reason: str):
        """Reject a candidate application."""
        # TODO: Update status to rejected
        # TODO: Notify candidate
        pass

    async def list_candidates(self, election_id: str = None):
        """List all candidates, optionally filtered."""
        # TODO: Query candidates with user details
        pass
