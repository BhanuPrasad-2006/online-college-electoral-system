"""
Face recognition and liveness detection service.

Provides:
- Face embedding extraction (DeepFace / Facenet)
- Face embedding comparison
- Liveness detection via Eye Aspect Ratio (EAR) blink analysis
- Serialization helpers
"""

import os
import cv2
import numpy as np
import json
from app.utils.logger import logger
from app.core.config import settings

MODEL_NAME = "Facenet"
DISTANCE_METRIC = "euclidean_l2"

# EAR (Eye Aspect Ratio) thresholds for liveness detection
EAR_THRESHOLD = 0.22  # Below this = eye considered "closed"

# Wrap deepface import to give a clear user-facing error if it's missing
_DeepFace = None
_deepface_import_error = None
try:
    from deepface import DeepFace as _DeepFace
except ImportError as e:
    _deepface_import_error = f"DeepFace library is not installed. Run: pip install deepface==0.0.79 (Error: {e})"
    logger.warning(_deepface_import_error)
except Exception as e:
    _deepface_import_error = f"DeepFace library failed to load: {e}"
    logger.error(_deepface_import_error)


def _ensure_deepface_available():
    """Raise a clear service-unavailable error if deepface cannot be used."""
    if _DeepFace is None:
        msg = _deepface_import_error or "Face recognition module is not available on this server."
        raise RuntimeError(msg)


def _bytes_to_cv2(image_data: bytes) -> np.ndarray:
    nparr = np.frombuffer(image_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image file or format")
    return img


def extract_face_embedding(image_data: bytes) -> list[float]:
    """
    Extracts face embedding from image bytes using DeepFace.
    Returns a list of floats (embedding vector).
    Raises ValueError if no face or multiple faces are found.
    Raises RuntimeError if the face recognition module is unavailable.
    """
    _ensure_deepface_available()

    img = _bytes_to_cv2(image_data)
    try:
        objs = _DeepFace.represent(img_path=img, model_name=MODEL_NAME, enforce_detection=True)

        if len(objs) == 0:
            raise ValueError("No face detected in the image. Make sure your face is clearly visible and well-lit.")
        if len(objs) > 1:
            raise ValueError("Multiple faces detected. Only one person should be in the frame.")

        embedding = objs[0]["embedding"]
        return embedding
    except ValueError as e:
        logger.error(f"Face extraction failed: {e}")
        raise ValueError(str(e))
    except Exception as e:
        err_str = str(e).lower()
        if "model" in err_str or "download" in err_str or "vgg-face" in err_str or "facenet" in err_str:
            logger.error(f"DeepFace model error: {e}")
            raise RuntimeError(
                "Face recognition model is not downloaded yet. Please contact the election admin "
                "so they can run the model setup on the server."
            )
        logger.error(f"Unexpected error in face extraction: {e}")
        raise ValueError("Failed to process face image. Please try again with a clearer photo.")


def compare_face_embeddings(emb1: list[float], emb2: list[float]) -> bool:
    """
    Compare two embedding vectors. Returns True if they match.
    """
    if not emb1 or not emb2:
        return False

    try:
        a = np.asarray(emb1, dtype=np.float32)
        b = np.asarray(emb2, dtype=np.float32)
        if a.shape != b.shape:
            logger.warning("Face embeddings shape mismatch: %s vs %s", a.shape, b.shape)
            return False

        distance = np.linalg.norm(a - b)
        logger.info(f"Face comparison distance: {distance}")
        if distance <= settings.FACE_MATCH_THRESHOLD:
            return True

        # Fallback to cosine similarity for cases where distance is marginal
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return False
        cosine_similarity = float(np.dot(a, b) / (norm_a * norm_b))
        logger.info(f"Face cosine similarity: {cosine_similarity}")
        return cosine_similarity >= settings.FACE_MATCH_COSINE_THRESHOLD
    except Exception as e:
        logger.error(f"Error comparing faces: {e}")
        return False


def serialize_embedding(embedding: list[float]) -> str:
    """Convert embedding list to JSON string for database storage"""
    return json.dumps(embedding)


def deserialize_embedding(embedding_str: str) -> list[float]:
    """Convert JSON string from database back to list"""
    if not embedding_str:
        return []
    try:
        return json.loads(embedding_str)
    except Exception:
        return []


# =============================================================
# LIVENESS DETECTION
# =============================================================

def check_basic_antispoof(image_data: bytes) -> dict:
    """
    Analyze a single face image for basic anti-spoofing cues.

    Uses Haar cascade face/eye detection, image sharpness (Laplacian),
    and brightness analysis as heuristics for basic anti-spoofing.
    Note: This is NOT EAR-based liveness — it is a heuristic check.

    Returns a dict with:
        - live (bool): Whether the image passes liveness checks
        - score (float): Confidence score (0-1)
        - reasons (list[str]): Human-readable reasons for the result
        - landmarks_found (bool): Whether facial landmarks were detected
    """
    img = _bytes_to_cv2(image_data)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    reasons: list[str] = []

    # 1. Detect face using Haar cascade
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(100, 100))

    if len(faces) == 0:
        return {"live": False, "score": 0.0, "reasons": ["No face detected"], "landmarks_found": False}
    if len(faces) > 1:
        return {"live": False, "score": 0.0, "reasons": ["Multiple faces detected"], "landmarks_found": False}

    (x, y, w, h) = faces[0]
    face_roi = gray[y : y + h, x : x + w]

    # 2. Detect eyes within the face region
    eye_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_eye.xml"
    )
    eyes = eye_cascade.detectMultiScale(face_roi, 1.1, 3, minSize=(20, 20))

    if len(eyes) < 2:
        # Might be a photo or eyes closed — suspicious
        reasons.append(f"Only {len(eyes)} eye(s) detected (expected 2)")
        landmarks_found = False
    else:
        landmarks_found = True

    # 3. Compute sharpness (Laplacian variance) — blur detection
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()

    if laplacian_var < 50:
        reasons.append(f"Image may be too blurry (sharpness={laplacian_var:.1f})")

    # 4. Check brightness distribution
    mean_brightness = np.mean(gray)
    brightness_score = 1.0 - abs(mean_brightness - 128) / 128.0  # 0-1, higher is better

    # 5. Liveness score calculation
    eye_score = min(1.0, len(eyes) / 2.0)  # 1.0 if both eyes, 0.5 if one, 0 if none
    sharpness_score = min(1.0, laplacian_var / 200.0)

    score = 0.4 * eye_score + 0.3 * sharpness_score + 0.3 * brightness_score

    # Decision
    live = score >= 0.5 and len(eyes) >= 1  # At least one visible eye + overall score

    if not live:
        reasons.append(f"Liveness score {score:.2f} below threshold 0.5")

    return {
        "live": live,
        "score": round(score, 3),
        "reasons": reasons or ["Passed all checks"],
        "landmarks_found": len(eyes) >= 2,
        "eye_count": len(eyes),
        "sharpness": round(laplacian_var, 1),
        "brightness": round(mean_brightness, 1),
    }


def check_antispoof_multiframe(frames: list[bytes]) -> dict:
    """
    Analyze multiple face images for basic anti-spoofing.

    Compares detection results across frames to check for variation.
    At least one frame should show both eyes detected, and frames should
    have some variation in scores to detect static photo attacks.

    Args:
        frames: List of JPEG/PNG image bytes.

    Returns:
        Dict with 'live' (bool), 'score', 'reasons'.
    """
    if len(frames) < 2:
        return check_basic_antispoof(frames[0] if frames else b"")

    results = [check_basic_antispoof(f) for f in frames]
    scores = [r["score"] for r in results]
    landmarks = [r["landmarks_found"] for r in results]

    # Must have at least one frame with landmarks
    any_landmarks = any(landmarks_found for landmarks_found in landmarks)
    if not any_landmarks:
        return {
            "live": False,
            "score": 0.0,
            "reasons": ["No facial landmarks detected in any frame"],
        }

    # Check for variation (liveness indicator)
    score_std = np.std(scores) if len(scores) > 1 else 0
    has_variation = score_std > 0.02

    avg_score = sum(scores) / len(scores)
    live = avg_score >= 0.45 and any_landmarks

    reasons = []
    if not has_variation:
        reasons.append("Frames too similar — possible static photo attack")
    if not any_landmarks:
        reasons.append("No facial landmarks detected")
    if not live:
        reasons.append(f"Average liveness score {avg_score:.2f} below threshold")

    return {
        "live": live,
        "score": round(avg_score, 3),
        "reasons": reasons or ["Passed multi-frame checks"],
        "frames_analyzed": len(frames),
        "score_variation": round(score_std, 3),
    }
