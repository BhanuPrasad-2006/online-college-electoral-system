import asyncio
import cv2
import numpy as np
import sys
sys.path.append(".")
from app.services.face_service import extract_face_embedding, normalize_image, compare_face_embeddings

async def main():
    ref_path = "uploads/faces/CSE/1DS24CY015_25594d.jpg"
    with open(ref_path, "rb") as f:
        ref_bytes = f.read()
    
    # Extract original embedding
    emb_orig = await extract_face_embedding(ref_bytes)
    
    img = normalize_image(ref_bytes)
    h, w = img.shape[:2]
    print(f"Original shape: {w}x{h}")
    
    # Crop to 3:4 portrait aspect ratio
    target_ratio = 480 / 640
    new_w = int(h * target_ratio)
    start_x = (w - new_w) // 2
    img_cropped = img[:, start_x:start_x+new_w]
    print(f"Cropped shape: {img_cropped.shape[1]}x{img_cropped.shape[0]}")
    
    resized = cv2.resize(img_cropped, (480, 640))
    ok, buf = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 82])
    
    emb_cropped = await extract_face_embedding(buf.tobytes())
    
    # Compare
    a = np.asarray(emb_orig, dtype=np.float32)
    b = np.asarray(emb_cropped, dtype=np.float32)
    sim = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
    print(f"Similarity with aspect-ratio preserved crop: {sim * 100:.2f}%")
    print(f"Does it match? {sim >= 0.45}")

if __name__ == "__main__":
    asyncio.run(main())
