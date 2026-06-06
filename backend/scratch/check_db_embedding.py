import asyncio
import sys
sys.path.append(".")
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.voter import Voter
from app.services.face_service import extract_face_embedding, deserialize_embedding, compare_face_embeddings

async def main():
    async with SessionLocal() as db:
        query = select(Voter).where(Voter.college_email == "1ds24cy015@dsce.edu.in")
        res = await db.execute(query)
        v = res.scalars().first()
        if not v:
            print("Voter not found!")
            return
        
        db_emb = deserialize_embedding(v.face_encoding)
        print(f"DB Embedding loaded. Length: {len(db_emb)}")
        
        ref_path = "uploads/faces/CSE/1DS24CY015_25594d.jpg"
        try:
            with open(ref_path, "rb") as f:
                ref_bytes = f.read()
            img_emb = await extract_face_embedding(ref_bytes)
            print(f"Reference Image Embedding extracted. Length: {len(img_emb)}")
            
            # Compare them
            match = compare_face_embeddings(db_emb, img_emb)
            print(f"Do they match in cosine similarity? {match}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
