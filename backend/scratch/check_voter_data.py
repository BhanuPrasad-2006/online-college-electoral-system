import asyncio
import sys

async def test():
    from app.db.session import SessionLocal
    from sqlalchemy import select
    from app.models.voter import Voter
    
    async with SessionLocal() as db:
        res = await db.execute(select(Voter).limit(5))
        voters = res.scalars().all()
        for v in voters:
            print(f"Name: {v.full_name}")
            print(f"  face_enrolled: {v.reference_image_url is not None and v.face_encoding is not None}")
            print(f"  reference_image_url: {v.reference_image_url}")
            print()

asyncio.run(test())
