import asyncio
import sys
import uuid
from app.db.session import SessionLocal
from app.models.voter import Voter

async def main():
    async with SessionLocal() as db:
        voter_id = uuid.UUID("b1a4c0c0-d21b-4e69-a36f-166de4fff416")
        v = await db.get(Voter, voter_id)
        if v:
            print("Voter Details for ID b1a4c0c0-d21b-4e69-a36f-166de4fff416:")
            print("Name:", v.full_name)
            print("Email:", v.college_email)
            print("Has Voted:", v.has_voted)
            print("Lockout Until:", v.lockout_until)
            print("Failed Face Attempts:", getattr(v, "failed_face_attempts", None))
            print("Reference Image URL:", v.reference_image_url)
            print("Embedding Model Version:", v.embedding_model_version)
        else:
            print("Voter not found in DB")

if __name__ == "__main__":
    asyncio.run(main())
