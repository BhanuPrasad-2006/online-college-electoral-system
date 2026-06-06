import asyncio
import sys
sys.path.append(".")
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.voter import Voter

async def main():
    async with SessionLocal() as db:
        query = select(Voter).where(Voter.college_email == "1ds24cy015@dsce.edu.in")
        res = await db.execute(query)
        v = res.scalars().first()
        if not v:
            print("Voter not found!")
            return
        
        print("Voter Name:", v.full_name)
        print("Reference Image URL:", v.reference_image_url)
        print("Has Face Encoding (Reference):", v.face_encoding is not None)
        print("Pending Image URL:", v.pending_image_url)
        print("Has Pending Face Encoding:", v.pending_face_encoding is not None)
        print("Previous Image URL:", v.previous_image_url)
        print("Has Previous Face Encoding:", v.previous_face_encoding is not None)
        print("Photo Reupload Count:", v.photo_reupload_count)
        print("Photo Reupload Requested:", v.photo_reupload_requested)

if __name__ == "__main__":
    asyncio.run(main())
