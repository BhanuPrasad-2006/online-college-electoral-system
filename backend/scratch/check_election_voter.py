import asyncio
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy import text, select, func
from app.db.session import SessionLocal
from app.models.voter import Voter
from app.models.election import Election
from app.models.vote import Vote
from app.services.phase_engine import PhaseEngine

async def main():
    async with SessionLocal() as db:
        v = (await db.execute(select(Voter).where(func.lower(Voter.college_email) == "1ds24cy015@dsce.edu.in"))).scalar_one()
        print("voter_id", v.voter_id)
        print("has_voted", v.has_voted)
        print("verification_id_set", v.verification_id is not None)
        e = (await db.execute(select(Election).order_by(Election.created_at.desc()))).scalars().first()
        if e:
            print("election_id", e.election_id)
            print("phase", PhaseEngine.get_current_phase(e))
            print("voting_allowed", PhaseEngine.is_voting_allowed(e))
        votes = (await db.execute(select(Vote).where(Vote.voter_id == v.voter_id))).scalars().all()
        print("existing_votes", len(votes))
        for vote in votes:
            print(" vote_id", vote.vote_id, "candidate", vote.candidate_id)

asyncio.run(main())
