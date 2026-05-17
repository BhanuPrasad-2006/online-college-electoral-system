import asyncio
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from app.db.session import SessionLocal
from app.models.candidate import Candidate
from app.models.voter import Voter
from app.models.position import Position

async def check_candidates():
    async with SessionLocal() as db:
        query = select(Candidate).options(
            joinedload(Candidate.voter),
            joinedload(Candidate.position)
        )
        res = await db.execute(query)
        candidates = res.scalars().all()
        print(f"Total candidates in database: {len(candidates)}")
        for c in candidates:
            print(f"ID: {c.candidate_id}, Voter: {c.voter.full_name if c.voter else 'None'}, Position: {c.position.title if c.position else 'None'}, Status: {c.status}")

if __name__ == "__main__":
    asyncio.run(check_candidates())
