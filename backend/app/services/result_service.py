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
        """Determine winners per position handling ties correctly."""
        results = await self.compute_results(election_id)
        position_summaries = []
        
        for position_id, candidates in results.items():
            total_votes = sum(c["vote_count"] for c in candidates)
            sorted_candidates = sorted(candidates, key=lambda c: c["vote_count"], reverse=True)
            
            if not sorted_candidates:
                continue
                
            highest_votes = sorted_candidates[0]["vote_count"]
            
            # Check for ties
            top_candidates = [c for c in sorted_candidates if c["vote_count"] == highest_votes]
            
            # Assign statuses
            for c in sorted_candidates:
                if c["vote_count"] == highest_votes:
                    c["winner_status"] = "TIE" if len(top_candidates) > 1 else "WON"
                else:
                    c["winner_status"] = "LOST"
                    
            winner_candidate_id = top_candidates[0]["candidate_id"] if len(top_candidates) == 1 else None
            
            position_summaries.append({
                "position_id": position_id,
                "winner_candidate_id": winner_candidate_id,
                "winner_status": "TIE" if len(top_candidates) > 1 else "WON",
                "highest_votes": highest_votes,
                "total_votes": total_votes,
                "candidates": sorted_candidates
            })
            
        return position_summaries

    async def get_candidate_result(self, election_id: str, candidate_id: str) -> dict | None:
        """Get the detailed result for a specific candidate."""
        summaries = await self.determine_winners(election_id)
        for summary in summaries:
            for i, cand in enumerate(summary["candidates"]):
                if cand["candidate_id"] == candidate_id:
                    total = summary["total_votes"]
                    percentage = (cand["vote_count"] / total * 100) if total > 0 else 0
                    
                    return {
                        "position_id": summary["position_id"],
                        "candidate_id": candidate_id,
                        "vote_count": cand["vote_count"],
                        "total_position_votes": total,
                        "vote_percentage": round(percentage, 2),
                        "rank": i + 1,
                        "winner_status": cand["winner_status"]
                    }
        return None

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
