import asyncio
import sys
sys.path.append(".")
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.voter import Voter

async def main():
    async with SessionLocal() as db:
        query = select(Voter)
        res = await db.execute(query)
        voters = res.scalars().all()
        print(f"Total voters in DB: {len(voters)}")
        for v in voters:
            print("-" * 50)
            print(f"ID: {v.voter_id}")
            print(f"Name: {v.full_name}")
            print(f"Email: {v.college_email}")
            print(f"Ref Image URL: {v.reference_image_url}")
            print(f"Has Encoding: {v.face_encoding is not None}")
            print(f"Model: {v.embedding_model_version}")

if __name__ == "__main__":
    asyncio.run(main())
