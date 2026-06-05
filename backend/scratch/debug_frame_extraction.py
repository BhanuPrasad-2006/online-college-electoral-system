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
    
    # 1. Extract embedding from original image
    emb_orig = await extract_face_embedding(ref_bytes)
    print(f"Original image embedding extracted. Length: {len(emb_orig)}")
    
    # 2. Normalize and check shape
    img = normalize_image(ref_bytes)
    print(f"Normalized image shape: {img.shape}") # (height, width, channels)
    
    # 3. Resize to 480x640 (as the test and frontend does)
    # Note: cv2.resize expects (width, height)
    resized = cv2.resize(img, (480, 640))
    print(f"Resized image shape: {resized.shape}")
    
    # 4. Save to JPEG and reload
    ok, buf = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 82])
    print(f"JPEG encode ok? {ok}, bytes size: {len(buf)}")
    
    # 5. Extract embedding from resized image bytes
    try:
        emb_resized = await extract_face_embedding(buf.tobytes())
        print(f"Resized image embedding extracted. Length: {len(emb_resized)}")
        
        # Compare them
        import numpy as np
        a = np.asarray(emb_orig, dtype=np.float32)
        b = np.asarray(emb_resized, dtype=np.float32)
        sim = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
        print(f"Cosine similarity between original and resized: {sim * 100:.2f}%")
    except Exception as e:
        print(f"Error during resized extraction: {e}")

if __name__ == "__main__":
    asyncio.run(main())
