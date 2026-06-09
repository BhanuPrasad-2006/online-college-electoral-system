"""
Passive Liveness Detection Service.

Validates that a sequence of face frames represents a real, live person
without requiring any active gestures (blink, turn head, etc.).

Checks performed:
  1. Minimum frame count
  2. Frame-to-frame pixel noise variance  (live cameras always have sensor noise)
  3. Face-embedding drift between frames  (slight natural movement expected)
  4. Brightness variation across frames   (live scenes flicker slightly)
  5. Identical-frame rejection            (static replay / screenshot detected)

Failure messages are intentionally generic to avoid leaking check logic.
"""

import gc
import hashlib
import logging
import numpy as np
from typing import Optional

logger = logging.getLogger(__name__)

# ── Tunable thresholds ──────────────────────────────────────────
# Minimum pixel-level noise variance expected from a real camera sensor.
# LOWERED: Mobile/webcam cameras with JPEG compression have very low raw variance.
# Printed photos / screen replays produce near-zero variance (~0).
# Further lowered from 0.01 → 0.003 because 8-frame average variance over
# 480x640 JPEG frames (quality 0.85) is typically 0.02–0.12 for live video.
# At 0.003, static images still register ~0 while real cameras always exceed this.
_MIN_PIXEL_NOISE_VARIANCE = 0.003

# Minimum mean cosine distance between embeddings across the frame sequence.
# A perfectly still printed photo will have distance ~0.
# Natural live faces have small but non-zero drift.
# LOWERED from 0.00001 → 0.000005 to allow for very still subjects who follow the
# "hold still" instruction — micro-movements still produce drift above this threshold.
_MIN_EMBEDDING_DRIFT = 0.000005

# Maximum embedding drift — if too high, the face moved too much (cover swap).
# RAISED: Some natural head wobble on mobile is larger than 0.30.
_MAX_EMBEDDING_DRIFT = 0.50

# Minimum brightness std-deviation across frames (live scenes have micro-flicker).
# LOWERED: Mobile/webcam cameras auto-adjust exposure — very stable brightness is normal.
# Further lowered from 0.0003 → 0.0001 because modern webcams with auto-exposure
# produce extremely stable brightness across 8 frames. Threshold 0.0001 still catches
# perfectly static replays where std would be exactly 0.
_MIN_BRIGHTNESS_VARIATION = 0.0001

# Minimum frames required to run checks.
_MIN_FRAMES = 3

# Maximum frames accepted.
_MAX_FRAMES = 8

# Generic user-facing error message — never expose internal check names.
GENERIC_FAILURE_MSG = "Unable to verify live face. Please try again."


# ── Public API ──────────────────────────────────────────────────

def check_passive_liveness(
    frames_bgr: list,
    embeddings: list,
) -> tuple[bool, Optional[str]]:
    """
    Run all passive liveness checks on a sequence of frames.

    Args:
        frames_bgr:  List of numpy BGR images (already normalized).
        embeddings:  Corresponding ArcFace embedding vectors (list of list[float]).

    Returns:
        (passed: bool, internal_reason: str | None)
        The internal_reason is for server-side logging only.
        Always show GENERIC_FAILURE_MSG to the user on failure.
    """
    n = len(frames_bgr)

    # 1 ── Minimum frame count ───────────────────────────────────
    if n < _MIN_FRAMES:
        return False, f"Insufficient frames: got {n}, need {_MIN_FRAMES}"

    try:
        # 2 ── Pixel noise variance ─────────────────────────────
        passed, reason = _check_pixel_noise(frames_bgr)
        if not passed:
            return False, reason

        # 3 ── Embedding drift ──────────────────────────────────
        passed, reason = _check_embedding_drift(embeddings)
        if not passed:
            return False, reason

        # 4 ── Brightness variation ─────────────────────────────
        passed, reason = _check_brightness_variation(frames_bgr)
        if not passed:
            return False, reason

        # 5 ── Identical-frame rejection ────────────────────────
        passed, reason = _check_no_identical_frames(frames_bgr)
        if not passed:
            return False, reason

        return True, None

    finally:
        # Safe memory cleanup — release all numpy references
        _safe_cleanup(frames_bgr)


def compute_majority_match(
    embeddings: list,
    stored_embedding: list,
    cosine_fn,
    required_fraction: float = 0.6,
) -> tuple[bool, int, int, float]:
    """
    Majority-vote ArcFace matching.
    At least `required_fraction` of frames must match the stored embedding.

    Returns:
        (passed, matched_count, total_count, avg_cosine_score_pct)
        avg_cosine_score_pct is the mean cosine similarity * 100, rounded to 1 dp.
    """
    total = len(embeddings)
    matched = 0
    scores = []

    stored_arr = np.asarray(stored_embedding, dtype=np.float32)
    stored_norm = np.linalg.norm(stored_arr)

    for emb in embeddings:
        try:
            emb_arr = np.asarray(emb, dtype=np.float32)
            emb_norm = np.linalg.norm(emb_arr)
            if stored_norm > 0 and emb_norm > 0:
                sim = float(np.dot(emb_arr, stored_arr) / (emb_norm * stored_norm))
                scores.append(sim)
                if cosine_fn(emb, stored_embedding):
                    matched += 1
            del emb_arr
        except Exception as e:
            logger.warning(f"Embedding comparison failed for one frame: {e}")
        finally:
            del emb

    del stored_arr
    gc.collect()

    threshold = int(total * required_fraction)
    passed = matched >= max(threshold, _MIN_FRAMES)
    avg_score_pct = round(float(np.mean(scores)) * 100, 1) if scores else 0.0
    return passed, matched, total, avg_score_pct


# ── Private checks ──────────────────────────────────────────────

def _check_pixel_noise(frames_bgr: list) -> tuple[bool, Optional[str]]:
    """
    Measure inter-frame pixel variance.
    Static sources (printed photo, screen replay) produce near-zero variance.
    """
    try:
        # Convert each frame to float32 grayscale
        grays = []
        for f in frames_bgr:
            g = np.mean(f.astype(np.float32), axis=2)  # simple luminance
            grays.append(g)

        # Stack and compute variance across the frame axis (axis=0)
        stack = np.stack(grays, axis=0)
        per_pixel_var = np.var(stack, axis=0)
        mean_var = float(np.mean(per_pixel_var))

        logger.debug(f"Passive liveness pixel noise variance: {mean_var:.4f}")

        del grays, stack, per_pixel_var
        gc.collect()

        if mean_var < _MIN_PIXEL_NOISE_VARIANCE:
            return False, f"Pixel noise too low ({mean_var:.3f} < {_MIN_PIXEL_NOISE_VARIANCE}): possible static image"
        return True, None

    except Exception as e:
        logger.error(f"Pixel noise check error: {e}")
        return False, "Pixel noise check failed unexpectedly"


def _check_embedding_drift(embeddings: list) -> tuple[bool, Optional[str]]:
    """
    Compute mean pairwise cosine distance between consecutive embeddings.
    A real live face will have small but non-zero drift from natural micro-movement.
    A perfectly still static source will have distance ≈ 0.
    """
    try:
        if len(embeddings) < 2:
            return False, "Not enough embeddings for drift check"

        distances = []
        for i in range(len(embeddings) - 1):
            a = np.asarray(embeddings[i], dtype=np.float32)
            b = np.asarray(embeddings[i + 1], dtype=np.float32)

            norm_a = np.linalg.norm(a)
            norm_b = np.linalg.norm(b)
            if norm_a == 0 or norm_b == 0:
                continue

            cosine_sim = float(np.dot(a, b) / (norm_a * norm_b))
            cosine_dist = 1.0 - cosine_sim
            distances.append(cosine_dist)

            del a, b

        if not distances:
            return False, "Could not compute embedding distances"

        mean_drift = float(np.mean(distances))
        logger.debug(f"Passive liveness embedding drift: {mean_drift:.6f}")

        del distances
        gc.collect()

        if mean_drift < _MIN_EMBEDDING_DRIFT:
            return False, f"Embedding drift too low ({mean_drift:.6f}): possible static image replay"
        if mean_drift > _MAX_EMBEDDING_DRIFT:
            return False, f"Embedding drift too high ({mean_drift:.4f}): possible face swap between frames"
        return True, None

    except Exception as e:
        logger.error(f"Embedding drift check error: {e}")
        return False, "Embedding drift check failed unexpectedly"


def _check_brightness_variation(frames_bgr: list) -> tuple[bool, Optional[str]]:
    """
    Compute standard deviation of mean brightness across frames.
    Live camera feeds always have subtle lighting micro-flicker.
    Perfectly stable brightness across all frames suggests a static source.
    """
    try:
        brightness_values = []
        for f in frames_bgr:
            gray = np.mean(f.astype(np.float32))
            brightness_values.append(gray)

        std_brightness = float(np.std(brightness_values))
        logger.debug(f"Passive liveness brightness variation (std): {std_brightness:.4f}")

        del brightness_values
        gc.collect()

        if std_brightness < _MIN_BRIGHTNESS_VARIATION:
            return False, f"Brightness variation too low ({std_brightness:.4f}): possible static source"
        return True, None

    except Exception as e:
        logger.error(f"Brightness variation check error: {e}")
        return False, "Brightness variation check failed unexpectedly"


def _check_no_identical_frames(frames_bgr: list) -> tuple[bool, Optional[str]]:
    """
    Check that no two frames are pixel-identical using SHA-256 of raw bytes.
    Rejects trivial replays where the same image is submitted multiple times.
    """
    try:
        seen_hashes: set = set()
        for f in frames_bgr:
            h = hashlib.sha256(f.tobytes()).hexdigest()
            if h in seen_hashes:
                return False, "Identical frames detected: possible replay attack"
            seen_hashes.add(h)

        del seen_hashes
        return True, None

    except Exception as e:
        logger.error(f"Identical frame check error: {e}")
        return False, "Frame deduplication check failed unexpectedly"


def _safe_cleanup(frames_bgr: list) -> None:
    """Explicitly release numpy frame references and trigger GC."""
    try:
        for i in range(len(frames_bgr)):
            frames_bgr[i] = None
        gc.collect()
    except Exception:
        pass


# ── Constants exposed for import ───────────────────────────────
MIN_FRAMES = _MIN_FRAMES
MAX_FRAMES = _MAX_FRAMES
GENERIC_FAILURE_MSG = GENERIC_FAILURE_MSG


# ══════════════════════════════════════════════════════════════════
# FUTURE ARCHITECTURE STUBS — DO NOT IMPLEMENT YET
# ══════════════════════════════════════════════════════════════════

class DeepfakeScoringInterface:
    """
    Stub interface for future deepfake detection integration.
    Expected to return a confidence score 0.0–1.0 (0 = deepfake, 1 = real).
    """
    @staticmethod
    def score_frames(frames_bgr: list) -> dict:
        """
        Stub: Run deepfake detection model on a sequence of frames.
        Returns: {"passed": bool, "score": float, "model": str}
        """
        return {"passed": True, "score": 1.0, "model": "stub"}


class ONNXAccelerationInterface:
    """
    Stub interface for future ONNX runtime acceleration of face processing.
    Replace DeepFace calls with ONNX-optimized ArcFace when ready.
    """
    @staticmethod
    def load_model(model_path: str) -> None:
        """Stub: Load ONNX model from path."""
        pass

    @staticmethod
    def run_inference(image_data: bytes) -> list:
        """Stub: Run ONNX inference and return embedding vector."""
        return []


class AdvancedPassiveLivenessInterface:
    """
    Stub interface for future advanced passive liveness checks.
    Examples: 3D depth map analysis, IR texture, blood flow pulse detection.
    """
    @staticmethod
    def analyze(frames_bgr: list) -> dict:
        """
        Stub: Run advanced passive liveness analysis.
        Returns: {"passed": bool, "confidence": float, "checks": list[str]}
        """
        return {"passed": True, "confidence": 1.0, "checks": []}
