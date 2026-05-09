"""Result service — handles election result computation and verification."""

from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.vote import Vote
from app.models.candidate import Candidate
from app.models.vote_stats import VoteStats


class ResultService:
    def __init__(self, db: Session):
        self.db = db

    async def compute_results(self, election_id: str) -> dict:
        """Aggregate vote counts per candidate per position."""
        results = (
            self.db.query(
                Vote.position,
                Vote.candidate_id,
                func.count(Vote.id).label("vote_count"),
            )
            .filter(Vote.election_id == election_id)
            .group_by(Vote.position, Vote.candidate_id)
            .all()
        )

        grouped: dict = {}
        for position, candidate_id, vote_count in results:
            if position not in grouped:
                grouped[position] = []
            grouped[position].append({
                "candidate_id": str(candidate_id),
                "vote_count": vote_count,
            })

        return grouped

    async def determine_winners(self, election_id: str) -> list:
        """Determine winners per position."""
        results = await self.compute_results(election_id)
        winners = []
        for position, candidates in results.items():
            sorted_candidates = sorted(candidates, key=lambda c: c["vote_count"], reverse=True)
            if sorted_candidates:
                winners.append({
                    "position": position,
                    "winner_candidate_id": sorted_candidates[0]["candidate_id"],
                    "vote_count": sorted_candidates[0]["vote_count"],
                })
        return winners

    async def get_participation_stats(self, election_id: str) -> list:
        """Get participation statistics by department."""
        stats = (
            self.db.query(VoteStats)
            .filter(VoteStats.election_id == election_id)
            .all()
        )
        return stats

    async def verify_result_hash(self, election_id: str, expected_hash: str) -> bool:
        """Verify result integrity against stored hash."""
        # TODO: Call generate_result_hash SQL function and compare
        pass
