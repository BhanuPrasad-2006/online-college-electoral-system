"""
Full face verification diagnostic for a single voter.
Usage: python scratch/debug_face_voter.py 1ds24cy015@dsce.edu.in
"""
import asyncio
import json
import sys
import os

import numpy as np
from sqlalchemy import select, func

# Ensure backend package imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal
from app.models.voter import Voter
from app.core.config import settings
from app.services.face_service import (
    deserialize_embedding,
    extract_face_embedding,
    compare_face_embeddings,
    normalize_image,
    check_image_quality,
    _ensure_deepface_available,
    ensure_model_loaded,
    MODEL_NAME,
)
from app.services.face_storage import load_reference_image_bytes, resolve_local_path
from app.services.passive_liveness_service import (
    check_passive_liveness,
    compute_majority_match,
    _check_pixel_noise,
    _check_embedding_drift,
    _check_brightness_variation,
    _check_no_identical_frames,
    MIN_FRAMES,
)


def cosine_similarity(a, b) -> float:
    a_arr = np.asarray(a, dtype=np.float32)
    b_arr = np.asarray(b, dtype=np.float32)
    na, nb = np.linalg.norm(a_arr), np.linalg.norm(b_arr)
    if na == 0 or nb == 0:
        return float("nan")
    return float(np.dot(a_arr, b_arr) / (na * nb))


def euclidean_distance(a, b) -> float:
    a_arr = np.asarray(a, dtype=np.float32)
    b_arr = np.asarray(b, dtype=np.float32)
    if a_arr.shape != b_arr.shape:
        return float("inf")
    return float(np.linalg.norm(a_arr - b_arr))


def detect_faces_debug(img_bgr):
    import cv2

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
    return [(int(x), int(y), int(w), int(h)) for (x, y, w, h) in faces]


async def main(email: str):
    email_norm = email.strip().lower()
    print("=" * 70)
    print(f"FACE VERIFICATION DEBUG — {email_norm}")
    print("=" * 70)

    async with SessionLocal() as db:
        res = await db.execute(
            select(Voter).where(func.lower(Voter.college_email) == email_norm)
        )
        voter = res.scalar_one_or_none()
        if not voter:
            print("ROOT CAUSE: Voter not found in database")
            return

        print("\n--- 1. VOTER RECORD ---")
        print(f"voter_id:              {voter.voter_id}")
        print(f"email:                 {voter.college_email}")
        print(f"full_name:             {voter.full_name}")
        print(f"department:            {voter.department}")
        print(f"student_id (USN):      {voter.student_id}")
        print(f"reference_image_url:   {voter.reference_image_url}")
        print(f"embedding_model_version: {voter.embedding_model_version}")
        print(f"failed_face_attempts:  {voter.failed_face_attempts}")
        print(f"lockout_until:         {voter.lockout_until}")
        print(f"has_voted:             {voter.has_voted}")
        print(f"vote_permission:       {voter.vote_permission}")

        local_path = resolve_local_path(voter.reference_image_url or "")
        print(f"resolved_local_path:   {local_path}")
        print(f"local_file_exists:     {os.path.isfile(local_path) if local_path else False}")

        print("\n--- 2. STORED EMBEDDING ---")
        if not voter.face_encoding:
            print("ROOT CAUSE: No face_encoding in database")
            return

        stored_emb = deserialize_embedding(voter.face_encoding)
        print(f"stored_dim:            {len(stored_emb)}")
        print(f"stored_first_5:        {stored_emb[:5]}")
        print(f"expected_arcface_dim:  512")
        print(f"dim_ok:                {len(stored_emb) == 512}")

        if len(stored_emb) != 512:
            print(
                "LIKELY ROOT CAUSE: Embedding dimension mismatch — "
                f"stored is {len(stored_emb)}D, live extraction expects 512D (ArcFace)"
            )

        print("\n--- 3. REFERENCE IMAGE LOAD ---")
        ref_bytes = await load_reference_image_bytes(voter.reference_image_url or "")
        if not ref_bytes:
            print("ROOT CAUSE: Cannot load reference image from reference_image_url")
            return
        print(f"reference_image_bytes: {len(ref_bytes)}")

        print("\n--- 4. ARCFACE MODEL ---")
        try:
            _ensure_deepface_available()
            ensure_model_loaded()
            print(f"model_name:            {MODEL_NAME}")
            print(f"arcface_loaded:        True")
        except Exception as e:
            print(f"ROOT CAUSE: ArcFace not loaded: {e}")
            return

        print("\n--- 5. RE-EXTRACT FROM ENROLLED PHOTO (sanity) ---")
        try:
            ref_emb = await extract_face_embedding(ref_bytes)
            print(f"ref_extract_dim:       {len(ref_emb)}")
            print(f"ref_extract_first_5:   {ref_emb[:5]}")
        except Exception as e:
            print(f"enrollment_re_extract_FAILED: {e}")
            ref_emb = None

        if ref_emb:
            cos = cosine_similarity(stored_emb, ref_emb)
            euc = euclidean_distance(stored_emb, ref_emb)
            match_bool = compare_face_embeddings(ref_emb, stored_emb)
            print(f"stored_vs_reextract_cosine: {cos:.6f}")
            print(f"stored_vs_reextract_euclidean: {euc:.6f}")
            print(f"threshold_cosine:      {settings.FACE_MATCH_COSINE_THRESHOLD}")
            print(f"compare_face_embeddings: {match_bool}")
            if not match_bool and len(stored_emb) == len(ref_emb) == 512:
                print(
                    "WARNING: Stored embedding does NOT match re-extracted enrollment photo — "
                    "DB embedding may be stale/wrong model"
                )

        print("\n--- 6. QUALITY + FACE DETECTION (enrollment photo) ---")
        try:
            img_bgr = normalize_image(ref_bytes)
            passed_q, q_reason = check_image_quality(img_bgr)
            print(f"quality_passed:        {passed_q}")
            print(f"quality_reason:        {q_reason}")
            boxes = detect_faces_debug(img_bgr)
            print(f"face_count:            {len(boxes)}")
            for i, box in enumerate(boxes):
                print(f"  face[{i}] bbox:          x={box[0]} y={box[1]} w={box[2]} h={box[3]}")
        except Exception as e:
            print(f"quality_check_error:   {e}")

        print("\n--- 7. PASSIVE LIVENESS SIMULATION (same image x5 frames) ---")
        print("(Simulates holding camera perfectly still — common failure mode)")
        if ref_emb:
            try:
                frames_bgr = [normalize_image(ref_bytes) for _ in range(5)]
                embeddings = [ref_emb for _ in range(5)]
                for name, fn in [
                    ("pixel_noise", _check_pixel_noise),
                    ("embedding_drift", _check_embedding_drift),
                    ("brightness", _check_brightness_variation),
                    ("identical_frames", _check_no_identical_frames),
                ]:
                    ok, reason = fn(frames_bgr if "noise" in name or "brightness" in name or "identical" in name else embeddings)
                    print(f"  liveness_{name}: {ok} — {reason}")

                live_ok, live_reason = check_passive_liveness(frames_bgr, embeddings)
                print(f"  liveness_overall:    {live_ok} — {live_reason}")

                match_ok, matched, total, avg_pct = compute_majority_match(
                    embeddings, stored_emb, compare_face_embeddings, required_fraction=0.6
                )
                print(f"  majority_match:      {match_ok} ({matched}/{total}, avg {avg_pct}%)")
            except Exception as e:
                print(f"  liveness_sim_error:  {e}")

        print("\n--- 8. PASSIVE LIVENESS SIMULATION (noisy variants x5) ---")
        if ref_emb:
            try:
                frames_bgr = []
                embeddings = []
                for i in range(5):
                    arr = np.frombuffer(ref_bytes, dtype=np.uint8)
                    # decode via normalize each time with tiny noise
                    base = normalize_image(ref_bytes)
                    noise = np.random.randint(-3, 4, base.shape, dtype=np.int16)
                    noisy = np.clip(base.astype(np.int16) + noise, 0, 255).astype(np.uint8)
                    frames_bgr.append(noisy)
                    # use slightly different embeddings by re-extracting noisy frames
                for f in frames_bgr:
                    import cv2
                    _, buf = cv2.imencode(".jpg", f, [cv2.IMWRITE_JPEG_QUALITY, 82])
                    embeddings.append(await extract_face_embedding(buf.tobytes()))

                live_ok, live_reason = check_passive_liveness(frames_bgr, embeddings)
                print(f"  liveness_noisy:      {live_ok} — {reason or live_reason}")

                match_ok, matched, total, avg_pct = compute_majority_match(
                    embeddings, stored_emb, compare_face_embeddings, required_fraction=0.6
                )
                print(f"  majority_match_noisy: {match_ok} ({matched}/{total}, avg {avg_pct}%)")
                if embeddings:
                    cos0 = cosine_similarity(stored_emb, embeddings[0])
                    print(f"  live_vs_stored_cosine[0]: {cos0:.6f}")
            except Exception as e:
                print(f"  noisy_sim_error:       {e}")

        print("\n--- 9. CONFIG ---")
        print(f"FACE_MATCH_COSINE_THRESHOLD: {settings.FACE_MATCH_COSINE_THRESHOLD}")
        print(f"FACE_ENFORCE_SIDE_ANGLE:     {settings.FACE_ENFORCE_SIDE_ANGLE}")
        print(f"MIN_FRAMES passive:          {MIN_FRAMES}")
        print(f"required_match_fraction:     0.6 (60% of frames)")

    print("\n" + "=" * 70)
    print("END REPORT")
    print("=" * 70)


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "1ds24cy015@dsce.edu.in"
    asyncio.run(main(target))
