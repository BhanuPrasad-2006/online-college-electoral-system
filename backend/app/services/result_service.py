"""Result service — handles election result computation and verification."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.vote import Vote
from app.models.candidate import Candidate
from app.models.vote_stats import VoteStats
from app.security.integrity_service import IntegrityService


class ResultService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def compute_results(self, election_id: str) -> dict:
        """Aggregate vote counts per candidate per position."""
        # Using SQLAlchemy 2.0 async select
        query = select(
            Vote.position_id,
            Vote.candidate_id,
            func.count(Vote.vote_id).label("vote_count"),
        ).where(
            Vote.election_id == election_id
        ).group_by(
            Vote.position_id, Vote.candidate_id
        )
        
        result = await self.db.execute(query)
        results = result.all()

        grouped: dict = {}
        for position_id, candidate_id, vote_count in results:
            pos_str = str(position_id)
            if pos_str not in grouped:
                grouped[pos_str] = []
            grouped[pos_str].append({
                "candidate_id": str(candidate_id) if candidate_id else "NOTA",
                "vote_count": vote_count,
            })

        return grouped

    async def determine_winners(self, election_id: str) -> list:
        """Determine winners per position."""
        results = await self.compute_results(election_id)
        winners = []
        for position_id, candidates in results.items():
            sorted_candidates = sorted(candidates, key=lambda c: c["vote_count"], reverse=True)
            if sorted_candidates:
                winners.append({
                    "position_id": position_id,
                    "winner_candidate_id": sorted_candidates[0]["candidate_id"],
                    "vote_count": sorted_candidates[0]["vote_count"],
                })
        return winners

    async def get_participation_stats(self, election_id: str) -> list:
        """Get participation statistics by department."""
        query = select(VoteStats).where(VoteStats.election_id == election_id)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def verify_result_hash(self, election_id: str, expected_hash: str) -> bool:
        """Verify result integrity against stored hash."""
        integrity_service = IntegrityService()
        generated = await integrity_service.generate_result_hash(self.db, election_id)
        return generated == expected_hash
