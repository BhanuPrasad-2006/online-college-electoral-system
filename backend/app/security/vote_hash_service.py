"""Vote hash service — generates hash chain for vote integrity."""

import hashlib
import json
from datetime import datetime


class VoteHashService:
    @staticmethod
    def generate_vote_hash(candidate_id: str, position: str, previous_hash: str = None) -> str:
        """Generate a SHA-256 hash for a vote entry."""
        data = {
            "candidate_id": candidate_id,
            "position": position,
            "timestamp": datetime.utcnow().isoformat(),
            "previous_hash": previous_hash or "genesis",
        }
        return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()

    @staticmethod
    def generate_receipt_hash(vote_hash: str, salt: str) -> str:
        """Generate a receipt hash for the voter."""
        data = f"{vote_hash}:{salt}"
        return hashlib.sha256(data.encode()).hexdigest()

    @staticmethod
    def verify_chain(votes: list) -> bool:
        """Verify the integrity of the vote hash chain."""
        for i in range(1, len(votes)):
            if votes[i].previous_hash != votes[i - 1].vote_hash:
                return False
        return True
