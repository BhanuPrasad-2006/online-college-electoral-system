import asyncio
import json
from sqlalchemy import select
from app.db.session import SessionLocal, engine
from app.models.voter import Voter
from app.services.face_service import extract_face_embedding, compare_face_embeddings, deserialize_embedding

async def debug_biometrics():
    async with SessionLocal() as db:
        res = await db.execute(select(Voter).where(Voter.college_email == "1ds24cy015@dsce.edu.in"))
        voter = res.scalar_one_or_none()
        if not voter:
            print("Voter not found.")
            return
            
        print(f"Voter: {voter.full_name}")
        print(f"Email: {voter.college_email}")
        print(f"Stored encoding version: {voter.embedding_model_version}")
        
        stored_emb = deserialize_embedding(voter.face_encoding)
        print(f"Stored encoding length: {len(stored_emb)}")
        
        # Load and extract from the reference image file
        image_path = "uploads/faces/student_25594d84-31c6-40bd-8071-c39ec872f71f.jpeg"
        import os
        if not os.path.exists(image_path):
            image_path = "uploads/faces/student_25594d84-31c6-40bd-8071-c39ec872f71f.jpg"
            
        print(f"Loading image: {image_path}")
        with open(image_path, "rb") as f:
            image_data = f.read()
            
        try:
            extracted_emb = await extract_face_embedding(image_data)
            print(f"Extracted embedding length: {len(extracted_emb)}")
            
            # Compare them
            match = compare_face_embeddings(extracted_emb, stored_emb)
            print(f"Match result: {match}")
        except Exception as e:
            print(f"Error during extraction/comparison: {e}")

asyncio.run(debug_biometrics())
