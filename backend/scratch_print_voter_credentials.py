import asyncio
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from app.db.session import SessionLocal
from app.models.voter import Voter
from app.models.candidate import Candidate

async def show_details():
    async with SessionLocal() as db:
        query = select(Candidate).options(joinedload(Candidate.voter))
        res = await db.execute(query)
        candidates = res.scalars().all()
        for c in candidates:
            print(f"Candidate: {c.voter.full_name if c.voter else 'None'}")
            print(f"  Email: {c.voter.college_email if c.voter else 'None'}")
            print(f"  Voter Mobile: {c.voter.mobile_number if c.voter else 'None'}")
            print(f"  Candidate Mobile: {c.mobile_number}")
            print(f"  Status: {c.status}")

if __name__ == "__main__":
    asyncio.run(show_details())
