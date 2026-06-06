import asyncio
import os
import sys
import json
import base64
import numpy as np
from sqlalchemy import select

sys.path.append(".")
from app.db.session import SessionLocal
from app.models.audit_log import AuditLog
from app.services.face_service import extract_face_embedding, compare_face_embeddings

async def main():
    async with SessionLocal() as db:
        query = (
            select(AuditLog)
            .where(
                AuditLog.actor_id == "b1a4c0c0-d21b-4e69-a36f-166de4fff416",
                AuditLog.description.like("%verify-face-passive%")
            )
            .order_by(AuditLog.created_at.desc())
            .limit(1)
        )
        res = await db.execute(query)
        log = res.scalars().first()
        if not log:
            print("No face verification audit log found for voter")
            return
            
        print(f"Found audit log from: {log.created_at}")
        # Parse description to find the body
        desc = log.description
        if "Body: " not in desc:
            print("No body found in log description")
            return
            
        body_part = desc.split("Body: ", 1)[1]
        try:
            body_json = json.loads(body_part)
        except Exception as e:
            print(f"Failed to parse JSON body from log: {e}")
            # Try to clean up
            if body_part.endswith("..."):
                print("Body is truncated in database! Let's search for a log that is not truncated or fetch the first valid-looking base64 chunk.")
                # Let's extract base64 directly from the text using regex
                import re
                match = re.search(r'data:image/jpeg;base64,([A-Za-z0-9+/=]+)', body_part)
                if match:
                    b64_data = match.group(1)
                    print(f"Found direct base64 chunk, length: {len(b64_data)}")
                    # Pad if needed
                    b64_data += "=" * ((4 - len(b64_data) % 4) % 4)
                    try:
                        img_data = base64.b64decode(b64_data)
                        print("Decoded direct base64 chunk successfully.")
                        await save_and_compare(img_data)
                        return
                    except Exception as e2:
                        print(f"Failed to decode regex-extracted base64: {e2}")
                return
            return
            
        frames = body_json.get("frames", [])
        if not frames:
            print("No frames in body")
            return
            
        frame = frames[0]
        if "," in frame:
            _, encoded = frame.split(",", 1)
        else:
            encoded = frame
            
        img_data = base64.b64decode(encoded)
        await save_and_compare(img_data)

async def save_and_compare(img_data):
    os.makedirs("scratch", exist_ok=True)
    out_path = "scratch/latest_verify_attempt.jpg"
    with open(out_path, "wb") as f:
        f.write(img_data)
    print(f"Saved live frame to {out_path}, size: {len(img_data)} bytes")
    
    # Compare with reference photo
    ref_path = "uploads/faces/yatish_ref.jpg"
    if not os.path.exists(ref_path):
        print(f"Reference photo {ref_path} does not exist.")
        return
        
    await compare_faces(out_path, ref_path)

async def compare_faces(live_path, ref_path):
    try:
        with open(live_path, "rb") as f:
            live_bytes = f.read()
        with open(ref_path, "rb") as f:
            ref_bytes = f.read()
            
        live_emb = await extract_face_embedding(live_bytes)
        ref_emb = await extract_face_embedding(ref_bytes)
        
        a = np.asarray(live_emb, dtype=np.float32)
        b = np.asarray(ref_emb, dtype=np.float32)
        sim = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
        print(f"ArcFace similarity: {sim * 100:.2f}% (matches? {sim >= 0.45})")
    except Exception as e:
        print(f"Error comparing faces: {e}")

if __name__ == "__main__":
    asyncio.run(main())
