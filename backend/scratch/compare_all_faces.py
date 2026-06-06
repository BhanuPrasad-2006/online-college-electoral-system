import asyncio
import os
import sys
sys.path.append(".")
from app.services.face_service import extract_face_embedding, compare_face_embeddings

async def main():
    user_img_path = "uploads/faces/CSE/1DS24CY015_25594d.jpg"
    try:
        with open(user_img_path, "rb") as f:
            user_bytes = f.read()
        user_emb = await extract_face_embedding(user_bytes)
        print(f"Loaded user selfie embedding.")
    except Exception as e:
        print(f"Error loading user selfie: {e}")
        return

    other_images = [
        "uploads/faces/student_078df338-1900-4d98-8cba-1d8b02154369.jpeg",
        "uploads/faces/student_25594d84-31c6-40bd-8071-c39ec872f71f.jpeg",
        "uploads/faces/student_25594d84-31c6-40bd-8071-c39ec872f71f.jpg",
        "uploads/faces/pending_voter_25594d84-31c6-40bd-8071-c39ec872f71f.jpg"
    ]

    for img_path in other_images:
        if not os.path.exists(img_path):
            print(f"File {img_path} does not exist.")
            continue
        try:
            with open(img_path, "rb") as f:
                img_bytes = f.read()
            img_emb = await extract_face_embedding(img_bytes)
            # Compute cosine similarity
            import numpy as np
            a = np.asarray(user_emb, dtype=np.float32)
            b = np.asarray(img_emb, dtype=np.float32)
            sim = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
            print(f"Comparison with {img_path}: similarity = {sim * 100:.1f}%, matches? {sim >= 0.45}")
        except Exception as e:
            print(f"Error checking {img_path}: {e}")

if __name__ == "__main__":
    asyncio.run(main())
