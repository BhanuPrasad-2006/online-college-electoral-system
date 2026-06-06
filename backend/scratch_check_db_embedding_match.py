import asyncio
import sys
import os
import json
import numpy as np

sys.path.append(".")
from app.db.session import SessionLocal
from app.models.voter import Voter
from app.services.face_service import extract_face_embedding

async def main():
    async with SessionLocal() as db:
        from sqlalchemy import select
        res = await db.execute(select(Voter).where(Voter.college_email == "1ds24cy015@dsce.edu.in"))
        voter = res.scalars().first()
        if not voter:
            print("Voter not found")
            return
            
        db_emb = json.loads(voter.face_encoding)
        print(f"DB face encoding length: {len(db_emb)}")
        
        # Extract from reference image
        ref_path = "uploads/faces/CSE/1DS24CY015_25594d.jpg"
        if not os.path.exists(ref_path):
            print(f"Reference image {ref_path} not found")
            return
            
        with open(ref_path, "rb") as file:
            ref_data = file.read()
            
        ref_emb = await extract_face_embedding(ref_data)
        
        # Calculate similarity
        a = np.asarray(db_emb, dtype=np.float32)
        b = np.asarray(ref_emb, dtype=np.float32)
        sim = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
        print(f"DB encoding vs CSE/1DS24CY015_25594d.jpg: similarity = {sim:.4f}")
        
        # Let's check similarity with pending_voter_...
        pending_path = "uploads/faces/pending_voter_25594d84-31c6-40bd-8071-c39ec872f71f.jpg"
        if os.path.exists(pending_path):
            with open(pending_path, "rb") as file:
                pending_data = file.read()
            pending_emb = await extract_face_embedding(pending_data)
            
            c = np.asarray(pending_emb, dtype=np.float32)
            sim_pending = float(np.dot(a, c) / (np.linalg.norm(a) * np.linalg.norm(c)))
            print(f"DB encoding vs pending_voter_...jpg: similarity = {sim_pending:.4f}")

asyncio.run(main())
