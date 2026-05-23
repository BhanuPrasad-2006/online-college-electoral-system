import asyncio
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from app.db.session import SessionLocal
from app.models.candidate import Candidate

async def check():
    async with SessionLocal() as db:
        query = select(Candidate).options(joinedload(Candidate.voter))
        res = await db.execute(query)
        candidates = res.scalars().all()
        for c in candidates:
            print(f"Candidate ID: {c.candidate_id}")
            print(f"  Voter ID: {c.voter_id}")
            print(f"  Voter Name: {c.voter.full_name if c.voter else 'None'}")
            print(f"  Voter Email: {c.voter.college_email if c.voter else 'None'}")
            print(f"  Status: {c.status}")

if __name__ == "__main__":
    asyncio.run(check())
