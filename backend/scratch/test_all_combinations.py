import asyncio
import os
import sys
import numpy as np

sys.path.append(".")
from app.services.face_service import extract_face_embedding

async def main():
    image_paths = {
        "CSE_enrolled_bhanu": "uploads/faces/CSE/1DS24CY015_25594d.jpg",
        "yatish_ref": "uploads/faces/yatish_ref.jpg",
        "db_ref": "uploads/faces/db_ref.jpg",
        "student_nithin": "uploads/faces/student_078df338-1900-4d98-8cba-1d8b02154369.jpeg",
        "student_bhanu_1": "uploads/faces/student_25594d84-31c6-40bd-8071-c39ec872f71f.jpeg",
        "student_bhanu_2": "uploads/faces/student_25594d84-31c6-40bd-8071-c39ec872f71f.jpg",
        "brain_media_jpg": r"C:\Users\Bhanu Prasad\.gemini\antigravity-ide\brain\98c2806c-344c-4fa3-b92f-fe146f3b4e81\media__1780765174831.jpg",
    }
    
    # Add files from .tempmediaStorage
    temp_dir = r"C:\Users\Bhanu Prasad\.gemini\antigravity-ide\brain\98c2806c-344c-4fa3-b92f-fe146f3b4e81\.tempmediaStorage"
    if os.path.exists(temp_dir):
        for f in os.listdir(temp_dir):
            if f.endswith(".jpg"):
                image_paths[f"temp_{f}"] = os.path.join(temp_dir, f)

    embeddings = {}
    for name, path in image_paths.items():
        if not os.path.exists(path):
            print(f"Skipping {name} (file not found: {path})")
            continue
        try:
            with open(path, "rb") as file:
                data = file.read()
            emb = await extract_face_embedding(data)
            embeddings[name] = emb
            print(f"Extracted embedding for {name}")
        except Exception as e:
            print(f"Failed to extract for {name}: {e}")

    print("\n" + "="*50 + "\nPairwise Cosine Similarity Matrix (threshold = 0.45):\n" + "="*50)
    names = list(embeddings.keys())
    for i in range(len(names)):
        for j in range(i, len(names)):
            n1 = names[i]
            n2 = names[j]
            a = np.asarray(embeddings[n1], dtype=np.float32)
            b = np.asarray(embeddings[n2], dtype=np.float32)
            sim = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
            print(f"  {n1} vs {n2}: {sim:.4f} (matches? {sim >= 0.45})")

if __name__ == "__main__":
    asyncio.run(main())
