import asyncio
import os
import shutil
import sys
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

sys.path.append(".")
from app.db.session import engine
from app.models.voter import Voter
from app.services.face_service import extract_face_embedding, serialize_embedding

SRC_IMAGE = r"C:\Users\Bhanu Prasad\.gemini\antigravity-ide\brain\3a3877b7-e7f4-4696-ab6b-4ff360e58562\media__1780676860128.jpg"
DEST_IMAGE = r"c:\Users\Bhanu Prasad\OneDrive\Desktop\oces\online-college-electoral-system\backend\uploads\faces\CSE\1DS24CY015_25594d.jpg"

async def main():
    if not os.path.exists(SRC_IMAGE):
        print(f"Error: Source image not found at {SRC_IMAGE}")
        return

    # 1. Copy the file to the destination path
    print(f"Copying face image from {SRC_IMAGE} to {DEST_IMAGE}...")
    os.makedirs(os.path.dirname(DEST_IMAGE), exist_ok=True)
    shutil.copy2(SRC_IMAGE, DEST_IMAGE)
    print("File copy complete.")

    # 2. Load the image bytes and extract ArcFace embedding
    print("Reading image and extracting ArcFace embedding...")
    with open(DEST_IMAGE, "rb") as f:
        image_bytes = f.read()

    try:
        new_embedding = await extract_face_embedding(image_bytes)
        serialized_emb = serialize_embedding(new_embedding)
        print("Embedding extraction successful!")
    except Exception as e:
        print(f"Failed to extract embedding: {e}")
        return

    # 3. Update the database
    SessionLocal = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    async with SessionLocal() as db:
        query = select(Voter).where(Voter.college_email == "1ds24cy015@dsce.edu.in")
        res = await db.execute(query)
        voter = res.scalars().first()
        
        if not voter:
            print("Error: Voter profile 1ds24cy015@dsce.edu.in not found in database!")
            return

        voter.face_encoding = serialized_emb
        voter.embedding_model_version = "arcface_v1"
        voter.failed_face_attempts = 0
        voter.lockout_until = None
        
        await db.commit()
        print(f"Voter {voter.full_name} profile updated successfully in the database!")
        print("Reference photo and embedding are now matching the new face.")

if __name__ == "__main__":
    asyncio.run(main())
