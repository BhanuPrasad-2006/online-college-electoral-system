import asyncio
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.voter import Voter

async def main():
    async with SessionLocal() as db:
        query = select(Voter).where(Voter.college_email == "1ds24cy015@dsce.edu.in")
        res = await db.execute(query)
        v = res.scalars().first()
        if v:
            print("ID:", v.voter_id)
            print("Email:", v.college_email)
            print("Is Verified:", v.is_verified)
            print("Vote Permission:", v.vote_permission)
            print("Has Voted:", v.has_voted)
            print("Verification ID:", v.verification_id)
            print("Reference Image URL:", v.reference_image_url)
            print("Has Face Encoding:", v.face_encoding is not None)
            print("Embedding Model Version:", v.embedding_model_version)
            print("Failed Face Attempts:", getattr(v, 'failed_face_attempts', None))
            print("Lockout Until:", v.lockout_until)
        else:
            print("Voter not found!")

if __name__ == "__main__":
    asyncio.run(main())
