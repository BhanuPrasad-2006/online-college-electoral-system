"""Integrity service — verifies overall election data integrity."""

import hashlib
from sqlalchemy.ext.asyncio import AsyncSession

class IntegrityService:
    async def verify_election_integrity(self, db: AsyncSession, election_id: str = None) -> dict:
        """
        Verify hash chain integrity for entire election.
        Features: verify immutable ledger, detect tampered votes, detect missing chain entries, validate cryptographic hashes.
        """
        from app.services.ledger_service import verify_ledger_integrity
        return await verify_ledger_integrity(db)

    async def generate_result_hash(self, db: AsyncSession, election_id: str) -> str:
        """
        Generate a final result hash for election results by aggregating 
        all vote hashes (current_hash) in the election chain.
        """
        from sqlalchemy import select
        from app.models.vote import Vote
        
        query = select(Vote.current_hash).where(
            Vote.election_id == election_id
        ).order_by(Vote.ledger_sequence.asc())
        
        result = await db.execute(query)
        hashes = result.scalars().all()
        
        if not hashes:
            # Return hash of empty string if no votes cast yet
            return hashlib.sha256(b"").hexdigest()
            
        concatenated = "".join([h for h in hashes if h])
        return hashlib.sha256(concatenated.encode("utf-8")).hexdigest()
