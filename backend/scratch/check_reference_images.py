import asyncio
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.voter import Voter

async def check_voters():
    async with SessionLocal() as db:
        res = await db.execute(select(Voter).where(Voter.full_name.ilike('%Nithin%') | Voter.full_name.ilike('%yatish%')))
        voters = res.scalars().all()
        for v in voters:
            print(f"Name: {v.full_name}")
            print(f"USN: {v.student_id}")
            print(f"Dept: {v.department}")
            print(f"Ref Image URL: {v.reference_image_url}")
            print("-" * 40)

if __name__ == "__main__":
    asyncio.run(check_voters())
