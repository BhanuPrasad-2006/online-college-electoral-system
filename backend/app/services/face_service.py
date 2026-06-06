"""
Face recognition and liveness detection service.
Utilizes the ArcFace model for high-accuracy biometric verification.
"""

import os

# Optimizing TensorFlow/CUDA memory footprint BEFORE importing DeepFace/TensorFlow
os.environ["TF_USE_LEGACY_KERAS"] = "1"
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

import cv2
import numpy as np
import json
import hashlib
import threading
import gc
import httpx
from datetime import datetime, timezone
from sqlalchemy import select
from app.utils.logger import logger
from app.core.config import settings

MODEL_NAME = "ArcFace"
DISTANCE_METRIC = "cosine"

# Thread-safe sliding cache for image frame replay protection (max 1000 hashes)
class ReplayCache:
    def __init__(self, max_size: int = 1000):
        self.max_size = max_size
        self.hashes = []
        self.hash_set = set()
        self.lock = threading.Lock()
        
    def is_replay_and_add(self, image_data: bytes) -> bool:
        h = hashlib.sha256(image_data).hexdigest()
        with self.lock:
            if h in self.hash_set:
                return True
            self.hash_set.add(h)
            self.hashes.append(h)
            if len(self.hashes) > self.max_size:
                oldest = self.hashes.pop(0)
                self.hash_set.discard(oldest)
            return False

replay_cache = ReplayCache()

_DeepFace = None
_deepface_import_error = None

def _load_deepface():
    """Lazily load DeepFace and configure TensorFlow to prevent memory bloat."""
    global _DeepFace, _deepface_import_error
    if _DeepFace is not None:
        return _DeepFace
    if _deepface_import_error is not None:
        raise RuntimeError(_deepface_import_error)
        
    logger.info("Initializing lazy load of DeepFace and configuring TensorFlow...")
    try:
        # Import TensorFlow programmatically and restrict CPU thread allocations
        import tensorflow as tf
        tf.config.threading.set_intra_op_parallelism_threads(1)
        tf.config.threading.set_inter_op_parallelism_threads(1)
        # Suppress tensorflow warnings and logs
        tf.get_logger().setLevel('ERROR')
    except Exception as e:
        logger.warning(f"Failed to programmatically configure TensorFlow thread pool options: {e}")

    try:
        from deepface import DeepFace as df
        _DeepFace = df
        logger.info("DeepFace successfully loaded and configured.")
        return _DeepFace
    except ImportError as e:
        _deepface_import_error = f"DeepFace library is not installed. Run: pip install deepface (Error: {e})"
        logger.error(_deepface_import_error)
        raise RuntimeError(_deepface_import_error)
    except Exception as e:
        _deepface_import_error = f"DeepFace library failed to load: {e}"
        logger.error(_deepface_import_error)
        raise RuntimeError(_deepface_import_error)


def _ensure_deepface_available():
    """Ensure deepface is loaded and return the instance."""
    return _load_deepface()


# ── Service-level rate limiter (Redis-backed, in-memory fallback) ──
async def _check_face_extract_rate_limit(key: str, max_requests: int, window_seconds: int = 60) -> bool:
    """
    Distributed sliding-window rate limiter for face extraction.
    Delegates to ``check_rate_limit`` from the rate-limiting middleware,
    which uses Redis sorted sets when Redis is available, and falls back
    to per-process in-memory storage otherwise.
    """
    from app.middleware.redis_rate_limiter import check_rate_limit
    return await check_rate_limit(key, max_requests, window_seconds)


# ── Daily face verification counter (Redis-backed, with in-memory fallback) ─
class RedisDailyCounter:
    """
    Distributed daily attempt counter backed by Redis.
    Automatically falls back to per-process in-memory counting if Redis is unavailable.

    Uses the same sliding-window sorted-set pattern as ``check_rate_limit``
    from the rate-limiting middleware.
    """

    async def check_and_increment(self, voter_id: str, max_per_day: int = 50) -> bool:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        key = f"face_daily:{voter_id}:{today}"
        # Reuse the existing distributed rate limiter with 86400-second window
        from app.middleware.redis_rate_limiter import check_rate_limit
        return await check_rate_limit(key, max_per_day, window_seconds=86400)

redis_daily_counter = RedisDailyCounter()


# ── Redis-backed face lockout store (distributed across workers) ──
class RedisFaceLockoutStore:
    """
    Distributed lockout store for face verification.

    Stores lockout_until timestamps in Redis with auto-expiry via TTL.
    Falls back gracefully (returns not-locked) if Redis is unavailable.

    The Voter model DB field is kept in sync for persistence across restarts.
    """

    async def check_lockout(self, voter_id: str) -> tuple[bool, int | None]:
        """
        Check if a voter is currently locked out.

        Returns (is_locked: bool, remaining_seconds: int | None).
        If Redis is unavailable, returns (False, None) — caller should
        fall back to the DB field.
        """
        key = f"face_lockout:{voter_id}"
        if not settings.USE_REDIS:
            return False, None

        try:
            from app.core.redis import redis_client
            ttl = await redis_client.ttl(key)
            if ttl is None or ttl <= 0:
                return False, None
            return True, int(ttl)
        except Exception:
            return False, None

    async def set_lockout(self, voter_id: str, duration_minutes: int) -> None:
        """Set a lockout for the given voter with Redis TTL (best-effort)."""
        key = f"face_lockout:{voter_id}"
        if not settings.USE_REDIS:
            return

        try:
            from app.core.redis import redis_client
            lockout_ts = datetime.now(timezone.utc).isoformat()
            await redis_client.setex(key, duration_minutes * 60, lockout_ts)
        except Exception:
            pass  # Non-critical — DB field is the persistent fallback

    async def clear_lockout(self, voter_id: str) -> None:
        """Remove a lockout from Redis (best-effort)."""
        key = f"face_lockout:{voter_id}"
        if not settings.USE_REDIS:
            return

        try:
            from app.core.redis import redis_client
            await redis_client.delete(key)
        except Exception:
            pass  # Non-critical — DB field is the persistent fallback


redis_face_lockout = RedisFaceLockoutStore()


# ── Redis-backed biometric token cache (distributed, one-time use) ──
class RedisBiometricTokenCache:
    """
    Distributed one-time-use token cache for face_session_token replay protection.

    Tokens are registered on successful face verification and consumed atomically
    when the vote is cast. Uses Redis ``SETEX`` + ``GETDEL`` for atomic
    register-and-consume semantics across all workers.

    Falls back to per-process in-memory store if Redis is unavailable.
    """

    def __init__(self):
        self._fallback_store: dict[str, str] = {}
        self._fallback_lock = threading.Lock()

    async def register_token(self, jti: str, voter_id: str, ttl_seconds: int = 900) -> None:
        """Register a JTI as a one-time-use token with Redis TTL."""
        key = f"biometric_token:{jti}"
        if settings.USE_REDIS:
            try:
                from app.core.redis import redis_client
                await redis_client.setex(key, ttl_seconds, voter_id)
                return
            except Exception:
                pass  # Fall through to in-memory

        with self._fallback_lock:
            self._fallback_store[key] = voter_id

    async def validate(self, jti: str, voter_id: str) -> bool:
        """Check that a token exists and belongs to the given voter without consuming it."""
        key = f"biometric_token:{jti}"
        if settings.USE_REDIS:
            try:
                from app.core.redis import redis_client
                stored_voter_id = await redis_client.get(key)
                return stored_voter_id == voter_id
            except Exception:
                pass  # Fall through to in-memory

        with self._fallback_lock:
            return self._fallback_store.get(key) == voter_id

    async def consume(self, jti: str, voter_id: str) -> bool:
        """
        Atomically check and consume a one-time-use token.

        Returns True if the token exists and belongs to the given voter.
        The token is deleted atomically regardless — it can only be used once.
        """
        key = f"biometric_token:{jti}"
        if settings.USE_REDIS:
            try:
                from app.core.redis import redis_client
                stored_voter_id = await redis_client.getdel(key)
                return stored_voter_id == voter_id
            except Exception:
                pass  # Fall through to in-memory

        with self._fallback_lock:
            stored = self._fallback_store.pop(key, None)
            return stored == voter_id

    async def validate_and_consume(self, jti: str, voter_id: str) -> bool:
        """Backward-compatible helper for callers that still need one-step consume semantics."""
        return await self.consume(jti, voter_id)


redis_biometric_token_cache = RedisBiometricTokenCache()


# Legacy sync-only fallback (not distributed, kept for backward compatibility)
class DailyFaceCounter:
    """In-memory per-voter daily attempt tracker. Per-process only.
    Prefer ``RedisDailyCounter`` for multi-worker deployments."""
    def __init__(self):
        self.counts: dict[str, tuple[str, int]] = {}
        self.lock = threading.Lock()

    def check_and_increment(self, voter_id: str, max_per_day: int = 50) -> bool:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        with self.lock:
            record = self.counts.get(voter_id)
            if record is None or record[0] != today:
                self.counts[voter_id] = (today, 1)
                return True
            if record[1] >= max_per_day:
                return False
            self.counts[voter_id] = (today, record[1] + 1)
            return True

daily_face_counter = DailyFaceCounter()  # sync fallback (kept for tests / sync contexts)


# ── Exponential lockout backoff ─────────────────────────────────
def compute_face_lockout_duration(failed_attempts: int) -> int:
    """
    Returns lockout minutes based on consecutive failure count.
    Uses exponential backoff: 15min, 30min, 1hr, then 24hr.
    """
    backoff = settings.LOCKOUT_BACKOFF_MINUTES
    if failed_attempts < 6:
        return backoff[0]  # 15 min
    elif failed_attempts < 10:
        return backoff[1]  # 30 min
    elif failed_attempts < 15:
        return backoff[2]  # 60 min
    else:
        return backoff[3]  # 1440 min (24 hr)

_model_warmed_up = False
_model_warmup_lock = threading.Lock()


def warmup_model():
    """
    Warmup DeepFace's ArcFace model with dummy data.
    Fails app startup if model initialization fails.
    """
    global _model_warmed_up
    df_instance = _ensure_deepface_available()
    logger.info(f"Initializing face recognition model warmup: {MODEL_NAME}...")
    try:
        # Pass a blank black image
        dummy_img = np.zeros((112, 112, 3), dtype=np.uint8)
        # DeepFace represent will load ArcFace weights and check setup
        df_instance.represent(img_path=dummy_img, model_name=MODEL_NAME, enforce_detection=False)
        logger.info(f"Biometric model {MODEL_NAME} successfully warmed up and loaded in memory.")
        _model_warmed_up = True
    except Exception as e:
        logger.critical(f"CRITICAL: Failed to warmup biometric model {MODEL_NAME}: {e}")
        raise RuntimeError(f"Biometric model initialization failed: {e}")


def ensure_model_loaded():
    """Ensure the ArcFace model is loaded in memory (thread-safe)."""
    global _model_warmed_up
    if not _model_warmed_up:
        with _model_warmup_lock:
            if not _model_warmed_up:
                warmup_model()


def normalize_image(image_data: bytes) -> np.ndarray:
    """
    Normalize image: Strip EXIF, fix orientation, safe resize, and return OpenCV BGR image.
    """
    from PIL import Image, ImageOps
    import io
    try:
        img = Image.open(io.BytesIO(image_data))
    except Exception as e:
        raise ValueError(f"Invalid image file format: {e}")

    # Fix orientation using EXIF data
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass

    # Ensure RGB mode
    if img.mode != "RGB":
        img = img.convert("RGB")

    # Safe resize to maximum 640px width/height while keeping aspect ratio
    img.thumbnail((640, 640))

    # Convert to OpenCV BGR numpy array
    rgb_arr = np.array(img)
    bgr_arr = rgb_arr[:, :, ::-1].copy()
    
    # Cleanup PIL image references
    img.close()
    return bgr_arr


def check_image_quality(img: np.ndarray) -> tuple[bool, str | None]:
    """
    Perform strict quality validation on the frame:
    - Blur detection (Laplacian variance)
    - Brightness detection (underexposure / overexposure)
    - Face detection (zero faces, multiple faces, side-angle face, tiny face)
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 1. Blur Check
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    if laplacian_var < 10.0:
        return False, f"Image is too blurry (sharpness: {laplacian_var:.1f}, min: 10.0)"

    # 2. Exposure Check
    mean_brightness = np.mean(gray)
    if mean_brightness < 25.0:
        return False, f"Image is too dark (brightness: {mean_brightness:.1f}, min: 25.0)"
    if mean_brightness > 220.0:
        return False, f"Image is overexposed (brightness: {mean_brightness:.1f}, max: 220.0)"

    # 3. Face Count & Size Check using Haar Cascade
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))

    if len(faces) == 0:
        return False, "No face detected or face is too far/tiny (min face size is 60x60px)."
    if len(faces) > 1:
        return False, "Multiple faces detected. Ensure only one person is in the frame."

    # 4. Side-Angle Check
    # Verify we can find at least one eye in the face region.
    # Profile / side-angle faces will fail or only show side profile, causing eye cascade failures.
    try:
        (x, y, w, h) = faces[0]
        face_roi = gray[y : y + h, x : x + w]
        eye_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_eye.xml"
        )
        eyes = eye_cascade.detectMultiScale(face_roi, 1.1, 3, minSize=(15, 15))
        if len(eyes) < 1:
            if settings.FACE_ENFORCE_SIDE_ANGLE:
                return False, "Face appears to be at a side angle. Please face the camera directly so both eyes are visible."
            logger.warning("Side-angle eye check: No eyes detected in face ROI. Proceeding with warning.")
    except Exception as e:
        logger.warning(f"Side-angle eye check failed to run: {e}")

    return True, None


async def extract_face_embedding(image_data: bytes, rate_limit_key: str | None = None) -> list[float]:
    """
    Extracts face embedding from image bytes using ArcFace.
    Returns a list of floats (embedding vector).
    
    Args:
        image_data: Raw image bytes.
        rate_limit_key: Optional identifier for service-level rate limiting.
            Pass voter_id or IP to add defense-in-depth rate limiting.
            Pass None to skip (e.g., for admin migration tasks).
    """
    df_instance = _ensure_deepface_available()
    ensure_model_loaded()

    # ── Service-level rate limiting (Redis-backed, defense-in-depth) ─
    if rate_limit_key is not None:
        rl_key = f"face_extract:{rate_limit_key}"
        allowed = await _check_face_extract_rate_limit(rl_key, settings.FACE_SERVICE_RATE_LIMIT, 60)
        if not allowed:
            logger.warning(f"Service-level rate limit hit for key: {rate_limit_key}")
            raise ValueError("Too many face verification requests. Please slow down and try again.")

    # Image Normalization
    img = normalize_image(image_data)
    
    # Strict Quality Check
    passed, reason = check_image_quality(img)
    if not passed:
        # Clear memory before raising
        del img
        gc.collect()
        raise ValueError(reason)

    try:
        objs = df_instance.represent(img_path=img, model_name=MODEL_NAME, enforce_detection=True)

        if len(objs) == 0:
            raise ValueError("No face detected in the image.")
        if len(objs) > 1:
            raise ValueError("Multiple faces detected in the image.")

        embedding = objs[0]["embedding"]
        
        # Cleanup
        del img
        gc.collect()
        return embedding
    except ValueError as e:
        logger.error(f"Face extraction failed: {e}")
        raise ValueError(str(e))
    except Exception as e:
        logger.error(f"DeepFace ArcFace extraction failed: {e}")
        raise ValueError("Failed to process face image. Please try again with a clearer photo.")


def compare_face_embeddings(emb1: list[float], emb2: list[float]) -> bool:
    """
    Compare two ArcFace embedding vectors using Cosine similarity.
    Returns True if they match.
    """
    if not emb1 or not emb2:
        return False

    try:
        a = np.asarray(emb1, dtype=np.float32)
        b = np.asarray(emb2, dtype=np.float32)
        if a.shape != b.shape:
            logger.warning("Face embeddings shape mismatch: %s vs %s", a.shape, b.shape)
            return False

        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return False
            
        cosine_similarity = float(np.dot(a, b) / (norm_a * norm_b))
        logger.info(f"ArcFace cosine similarity: {cosine_similarity} (threshold: {settings.FACE_MATCH_COSINE_THRESHOLD})")
        
        # Cleanup arrays
        del a, b
        
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


async def migrate_voters_to_arcface(db):
    """
    Find voters with old embeddings (Facenet or no model version)
    and migrate them automatically to ArcFace embeddings.
    """
    from app.models.voter import Voter
    
    # Query voters with face encodings where embedding model version is not arcface_v1
    stmt = select(Voter).where(
        Voter.face_encoding.isnot(None),
        (Voter.embedding_model_version.is_(None)) | (Voter.embedding_model_version != "arcface_v1")
    )
    res = await db.execute(stmt)
    voters = res.scalars().all()
    
    if not voters:
        return
        
    logger.info(f"Found {len(voters)} voters requiring face embedding migration to ArcFace...")
    
    for voter in voters:
        ref_url = voter.reference_image_url
        if not ref_url:
            continue
            
        logger.info(f"Migrating embedding for voter: {voter.full_name} ({voter.college_email})")
        from app.services.face_storage import load_reference_image_bytes

        image_bytes = await load_reference_image_bytes(ref_url)
                
        if image_bytes:
            try:
                # Extract new ArcFace embedding
                new_emb = await extract_face_embedding(image_bytes)
                voter.face_encoding = serialize_embedding(new_emb)
                voter.embedding_model_version = "arcface_v1"
                logger.info(f"Voter {voter.full_name} successfully migrated to ArcFace.")
            except Exception as e:
                logger.warning(
                    f"Biometric migration failed for {voter.full_name}. Clearing embedding and requiring re-enrollment. Error: {e}"
                )
                # Clear invalid embedding to force re-enrollment safely
                voter.face_encoding = None
                voter.embedding_model_version = None
                voter.reference_image_url = None
        else:
            logger.warning(f"Could not load reference image for {voter.full_name}. Clearing and requiring re-enrollment.")
            voter.face_encoding = None
            voter.embedding_model_version = None
            voter.reference_image_url = None
            
    await db.commit()
    logger.info("Automatic ArcFace migration processing finished.")


# =============================================================
# STUBS FOR FUTURE BIOMETRICS (PREPARE ONLY)
# =============================================================

class AntiDeepfakeDetector:
    @staticmethod
    def analyze(image_data: bytes) -> dict:
        """Stub interface for deepfake analysis"""
        return {"passed": True, "confidence_score": 1.0}


class VoiceVerifier:
    @staticmethod
    def verify(audio_data: bytes) -> dict:
        """Stub interface for voice authentication"""
        return {"passed": True}


class ONNXRuntimeMigration:
    @staticmethod
    def optimize_model():
        """Stub interface for ONNX optimization"""
        pass


class BehavioralBiometrics:
    @staticmethod
    def analyze_interactions():
        """Stub interface for mouse/keyboard behavioral biometrics"""
        pass
