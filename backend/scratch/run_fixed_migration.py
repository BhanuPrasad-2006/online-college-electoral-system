import asyncio
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.voter import Voter
from app.services.face_service import deserialize_embedding, serialize_embedding, extract_face_embedding
import os
import httpx
from app.utils.logger import logger

async def run_fixed_migration():
    async with SessionLocal() as db:
        print("Querying all voters with face encodings...")
        stmt = select(Voter).where(Voter.face_encoding.isnot(None))
        res = await db.execute(stmt)
        voters = res.scalars().all()
        
        voters_to_migrate = []
        for voter in voters:
            emb = deserialize_embedding(voter.face_encoding)
            if voter.embedding_model_version != "arcface_v1" or len(emb) != 512:
                print(f"Voter {voter.college_email} needs migration (Version: {voter.embedding_model_version}, Dim: {len(emb)})")
                voters_to_migrate.append(voter)
            else:
                print(f"Voter {voter.college_email} is OK (Version: {voter.embedding_model_version}, Dim: {len(emb)})")
                
        if not voters_to_migrate:
            print("No voters need migration.")
            return
            
        print(f"Migrating {len(voters_to_migrate)} voters...")
        for voter in voters_to_migrate:
            ref_url = voter.reference_image_url
            if not ref_url:
                print(f"Skipping {voter.college_email} — no reference image URL.")
                continue
                
            print(f"Migrating voter: {voter.full_name} ({voter.college_email}) from URL: {ref_url}")
            image_bytes = None
            
            # Load local image or download external image
            if ref_url.startswith("/uploads/"):
                local_path = ref_url.lstrip("/")
                if os.path.exists(local_path):
                    try:
                        with open(local_path, "rb") as f:
                            image_bytes = f.read()
                    except Exception as e:
                        print(f"Failed to read local reference photo {local_path}: {e}")
            else:
                # Download URL
                try:
                    async with httpx.AsyncClient() as client:
                        resp = await client.get(ref_url, timeout=15.0)
                        if resp.status_code == 200:
                            image_bytes = resp.content
                        else:
                            print(f"Failed downloading reference image from {ref_url}: HTTP {resp.status_code}")
                except Exception as e:
                    print(f"Exception downloading reference image from {ref_url}: {e}")
                    
            if image_bytes:
                try:
                    # Extract new ArcFace embedding
                    new_emb = await extract_face_embedding(image_bytes)
                    voter.face_encoding = serialize_embedding(new_emb)
                    voter.embedding_model_version = "arcface_v1"
                    print(f"Voter {voter.full_name} successfully migrated to ArcFace (Dim: {len(new_emb)}).")
                except Exception as e:
                    print(f"Biometric migration failed for {voter.full_name}. Error: {e}")
            else:
                print(f"Could not load reference image for {voter.full_name}.")
                
        await db.commit()
        print("Migration transaction committed.")

asyncio.run(run_fixed_migration())
