"""
Simulate frontend webcam capture (480x640 JPEG q=0.82) and run full passive verify pipeline.
"""
import asyncio
import base64
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, func

from app.db.session import SessionLocal
from app.models.voter import Voter
from app.core.config import settings
from app.services.face_service import (
    deserialize_embedding,
    extract_face_embedding,
    compare_face_embeddings,
    normalize_image,
    check_image_quality,
)
from app.services.face_storage import load_reference_image_bytes
from app.services.passive_liveness_service import (
    check_passive_liveness,
    compute_majority_match,
)


FRAME_W, FRAME_H = 480, 640
JPEG_QUALITY = 82
NUM_FRAMES = 5


def encode_jpeg_frame(img_bgr: np.ndarray, shift_px: int = 0) -> bytes:
    """Mimic canvas capture: resize to 480x640, optional sub-pixel shift for variation."""
    h, w = img_bgr.shape[:2]
    resized = cv2.resize(img_bgr, (FRAME_W, FRAME_H))
    if shift_px:
        M = np.float32([[1, 0, shift_px], [0, 1, 0]])
        resized = cv2.warpAffine(resized, M, (FRAME_W, FRAME_H), borderMode=cv2.BORDER_REPLICATE)
    # Add tiny sensor noise like a real webcam
    noise = np.random.randint(-2, 3, resized.shape, dtype=np.int16)
    noisy = np.clip(resized.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    ok, buf = cv2.imencode(".jpg", noisy, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        raise RuntimeError("JPEG encode failed")
    return buf.tobytes()


async def main():
    email = "1ds24cy015@dsce.edu.in"
    async with SessionLocal() as db:
        res = await db.execute(
            select(Voter).where(func.lower(Voter.college_email) == email.strip().lower())
        )
        voter = res.scalar_one_or_none()
        if not voter:
            print("voter not found")
            return

        stored_emb = deserialize_embedding(voter.face_encoding)
        ref_bytes = await load_reference_image_bytes(voter.reference_image_url or "")
        img = normalize_image(ref_bytes)

        print("Simulating 5 webcam frames from enrollment photo (with micro-shifts + noise)")
        frames_bgr = []
        embeddings = []
        scores = []

        for i in range(NUM_FRAMES):
            jpeg = encode_jpeg_frame(img, shift_px=i % 3 - 1)
            bgr = normalize_image(jpeg)
            passed_q, q_reason = check_image_quality(bgr)
            emb = await extract_face_embedding(jpeg)
            sim = float(
                np.dot(np.asarray(emb), np.asarray(stored_emb))
                / (np.linalg.norm(emb) * np.linalg.norm(stored_emb))
            )
            match = compare_face_embeddings(emb, stored_emb)
            frames_bgr.append(bgr)
            embeddings.append(emb)
            scores.append(sim)
            print(
                f"  frame[{i}] quality={passed_q} reason={q_reason} "
                f"cosine={sim:.4f} match={match}"
            )

        live_ok, live_reason = check_passive_liveness(frames_bgr, embeddings)
        match_ok, matched, total, avg_pct = compute_majority_match(
            embeddings, stored_emb, compare_face_embeddings, required_fraction=0.6
        )
        print(f"\nliveness_passed: {live_ok} reason={live_reason}")
        print(f"majority_match:  {match_ok} ({matched}/{total}) avg={avg_pct}%")
        print(f"threshold:       {settings.FACE_MATCH_COSINE_THRESHOLD}")
        print(f"per_frame_cosine: {[round(s, 4) for s in scores]}")


if __name__ == "__main__":
    asyncio.run(main())
