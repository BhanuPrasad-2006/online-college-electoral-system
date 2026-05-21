import asyncio
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.voter import Voter

async def show_details():
    async with SessionLocal() as db:
        query = select(Voter)
        res = await db.execute(query)
        voters = res.scalars().all()
        for v in voters:
            print(f"Voter: {v.full_name}")
            print(f"  Email: {v.college_email}")
            print(f"  Mobile: {v.mobile_number}")
            print(f"  Year of Study: {v.year_of_study}")

if __name__ == "__main__":
    asyncio.run(show_details())
