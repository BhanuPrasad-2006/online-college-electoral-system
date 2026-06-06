import asyncio
from app.services.face_service import extract_face_embedding, compare_face_embeddings
import os

async def compare_all():
    folder = "uploads/faces"
    files = [f for f in os.listdir(folder) if "25594d84-31c6-40bd-8071-c39ec872f71f" in f]
    print(f"Files found: {files}")
    
    embeddings = {}
    for f in files:
        path = os.path.join(folder, f)
        with open(path, "rb") as file:
            data = file.read()
        try:
            emb = await extract_face_embedding(data)
            embeddings[f] = emb
            print(f"Extracted from {f}, dimension: {len(emb)}")
        except Exception as e:
            print(f"Failed to extract from {f}: {e}")
            
    print("\nPairwise cosine similarities:")
    import numpy as np
    for f1, emb1 in embeddings.items():
        for f2, emb2 in embeddings.items():
            a = np.asarray(emb1, dtype=np.float32)
            b = np.asarray(emb2, dtype=np.float32)
            sim = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
            print(f"  {f1} vs {f2}: similarity = {sim:.4f}")

asyncio.run(compare_all())
