from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import asyncio
import uuid
import hashlib
import re
import base64
import os
import secrets
import jwt
from datetime import timezone, datetime, timedelta
from app.services.face_service import (
    extract_face_embedding,
    compare_face_embeddings,
    deserialize_embedding,
    serialize_embedding,
    normalize_image,
    check_image_quality,
    compute_face_lockout_duration,
    redis_daily_counter,
    redis_face_lockout,
    redis_biometric_token_cache,
    assess_frame_quality,
    enhance_frame,
)
from app.utils.image_validator import validate_image
from app.services.passive_liveness_service import (
    check_passive_liveness,
    compute_majority_match,
    MIN_FRAMES,
    MAX_FRAMES,
)
from app.services.phase_engine import PhaseEngine

from app.db.session import get_db
from app.api.deps import get_current_user, get_voter_user, get_admin_user, get_voting_session
from app.models.voter import Voter
from app.models.candidate import Candidate
from app.models.election import Election
from app.models.position import Position
from app.models.vote import Vote
from app.enums.election_status import ElectionStatusEnum
from app.services.email_service import send_election_email
from app.services.face_storage import FaceStorageError, save_voter_face_image
from app.utils.logger import logger
from app.utils.helpers import extract_client_ip
from app.core.config import settings
from pydantic import BaseModel
from typing import Optional, List
from app.middleware.rate_limit import limiter
from app.models.audit_log import AuditLog

router = APIRouter()
_sqlite_locks = {}


# ── Redis-backed verification ID lockout (distributed) ───────────
class RedisVerifyIdLockoutStore:
    """
    Distributed lockout for verification ID failures.

    Stores attempt counts in Redis with TTL. After 3 consecutive failures,
    the voter is locked out for 15 minutes.
    Falls back to DB column (voter.verify_id_lockout_until) when Redis
    is unavailable, matching the face lockout pattern.
    """
    MAX_ATTEMPTS = 3
    LOCKOUT_MINUTES = 15

    async def check_lockout(self, voter_id: str) -> tuple[bool, int | None]:
        """Check Redis for an active lockout. Returns (is_locked, remaining_seconds)."""
        key = f"verify_id_lockout:{voter_id}"
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

    async def increment_and_check(self, voter_id: str) -> tuple[bool, int | None]:
        """
        Increment the failure counter in Redis. If threshold reached, set lockout.
        Returns (is_locked, remaining_seconds) after increment.
        """
        counter_key = f"verify_id_attempts:{voter_id}"
        lockout_key = f"verify_id_lockout:{voter_id}"
        if not settings.USE_REDIS:
            return False, None
        try:
            from app.core.redis import redis_client
            count = await redis_client.incr(counter_key)
            if count == 1:
                await redis_client.expire(counter_key, self.LOCKOUT_MINUTES * 60)
            if count >= self.MAX_ATTEMPTS:
                await redis_client.setex(lockout_key, self.LOCKOUT_MINUTES * 60, "locked")
                ttl = await redis_client.ttl(lockout_key)
                return True, int(ttl) if ttl else self.LOCKOUT_MINUTES * 60
            return False, None
        except Exception:
            return False, None

    async def clear(self, voter_id: str) -> None:
        """Clear Redis lockout and attempt counter on successful verification."""
        if not settings.USE_REDIS:
            return
        try:
            from app.core.redis import redis_client
            await redis_client.delete(f"verify_id_attempts:{voter_id}")
            await redis_client.delete(f"verify_id_lockout:{voter_id}")
        except Exception:
            pass


def check_verify_id_db_lockout(voter) -> tuple[bool, int | None]:
    """
    DB fallback: check voter.verify_id_lockout_until for an active lockout.
    Used when Redis is unavailable (mirrors the face lockout DB fallback).
    Returns (is_locked, remaining_seconds).
    """
    if not voter.verify_id_lockout_until:
        return False, None
    lockout_until = voter.verify_id_lockout_until
    if lockout_until.tzinfo is None:
        lockout_until = lockout_until.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    if now < lockout_until:
        remaining = int((lockout_until - now).total_seconds())
        return True, remaining
    return False, None


def set_verify_id_db_lockout(voter):
    """
    DB fallback: persist lockout timestamp to voter.verify_id_lockout_until.
    Caller must commit the session.
    """
    voter.verify_id_lockout_until = datetime.now(timezone.utc) + timedelta(
        minutes=RedisVerifyIdLockoutStore.LOCKOUT_MINUTES
    )


def clear_verify_id_db_lockout(voter):
    """
    DB fallback: clear lockout timestamp and attempt counter.
    Caller must commit the session.
    """
    voter.verify_id_lockout_until = None
    voter.failed_verify_id_attempts = 0


redis_verify_id_lockout = RedisVerifyIdLockoutStore()


async def increment_face_attempts_with_lock(
    db: AsyncSession, voter_id
) -> tuple[int, int | None]:
    """
    Atomically increment failed_face_attempts using a tight-scope row lock.

    Does a SELECT FOR UPDATE, increments the counter, sets lockout if the
    threshold is reached, commits immediately, and returns the result.
    The lock is held for microseconds (one read + one write + one commit).

    Returns:
        (new_count, lockout_minutes | None)
    """
    lock_query = select(Voter).where(Voter.voter_id == voter_id).with_for_update()
    result = await db.execute(lock_query)
    locked_voter = result.scalar_one_or_none()
    if not locked_voter:
        return 0, None

    locked_voter.failed_face_attempts = (locked_voter.failed_face_attempts or 0) + 1
    new_count = locked_voter.failed_face_attempts
    lockout_minutes = None

    if new_count >= 3:
        lockout_minutes = compute_face_lockout_duration(new_count)
        locked_voter.lockout_until = datetime.now(timezone.utc) + timedelta(minutes=lockout_minutes)
        await redis_face_lockout.set_lockout(str(voter_id), lockout_minutes)

    await db.commit()
    return new_count, lockout_minutes


def get_sqlite_lock() -> asyncio.Lock:
    loop = asyncio.get_running_loop()
    if loop not in _sqlite_locks:
        _sqlite_locks[loop] = asyncio.Lock()
    return _sqlite_locks[loop]


class FaceVerifyRequest(BaseModel):
    live_face_image: str
    anti_replay_token: str


class PassiveFaceVerifyRequest(BaseModel):
    frames: List[str]          # 3–8 base64-encoded JPEG frames
    anti_replay_token: str


class VoteCastRequest(BaseModel):
    candidate_id: Optional[str] = None
    verification_id: str  # Must match voter.verification_id hash in DB
    anti_replay_token: Optional[str] = None
    live_face_image: Optional[str] = None
    face_session_token: Optional[str] = None  # Signed biometric token
    submit_time_ms: Optional[int] = None
    verification_field_confirm: Optional[str] = None
    hidden_field_name: Optional[str] = None
    phone_confirm: Optional[str] = None


# ── Passive Liveness Endpoint ────────────────────────────────────
@router.post("/verify-face-passive")
@limiter.limit("5/10minute")
async def verify_face_passive(
    request: Request,
    body: PassiveFaceVerifyRequest,
    current_user: dict = Depends(get_voting_session),
    db: AsyncSession = Depends(get_db),
):
    """
    Passive liveness face verification.
    Accepts 3–8 frames captured automatically without active gestures.
    Backend performs: per-frame quality/replay checks, passive liveness
    analysis, and majority-vote ArcFace matching.
    Returns a signed face_session_token on success.
    """
    import gc as _gc

    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    # Fetch active election first to get election_id for logging
    # Must filter by VOTING_OPEN so we always pick the election that is actually open for voting.
    election_query = (
        select(Election)
        .where(Election.status == ElectionStatusEnum.VOTING_OPEN)
        .order_by(Election.created_at.desc())
    )
    election_result = await db.execute(election_query)
    election = election_result.scalars().first()
    election_id_str = str(election.election_id) if election else "None"

    # Log FACE_VERIFICATION_STARTED
    user_agent = request.headers.get("user-agent", "unknown")
    ip_addr = extract_client_ip(request)
    start_audit = AuditLog(
        event_type="FACE_VERIFICATION_STARTED",
        actor_id=uuid.UUID(voter_id) if isinstance(voter_id, str) else voter_id,
        description=f"User Agent: {user_agent} | Election ID: {election_id_str} | Passive face verification started",
        ip_address=ip_addr,
        created_at=datetime.now(timezone.utc)
    )
    db.add(start_audit)
    await db.commit()

    # ── Early lockout check (Redis-backed, distributed) ──────────
    redis_locked, redis_remaining = await redis_face_lockout.check_lockout(str(voter_id))
    if redis_locked and redis_remaining is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Face verification is locked. Try again in {redis_remaining // 60}m {redis_remaining % 60}s."
        )

    # ── Fetch voter ────────────────────────────────────────────
    query = select(Voter).where(Voter.voter_id == voter_id)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()
    if not voter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter profile not found.")

    if voter.has_voted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You have already cast your vote.")

    # ── Lockout check ──────────────────────────────────────────
    now = datetime.now(timezone.utc)
    if not redis_locked:
        # DB fallback check (used when Redis was unavailable)
        if voter.lockout_until:
            lockout_until = voter.lockout_until
            if lockout_until.tzinfo is None:
                lockout_until = lockout_until.replace(tzinfo=timezone.utc)
            if now < lockout_until:
                remaining = int((lockout_until - now).total_seconds())
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Face verification is locked. Try again in {remaining // 60}m {remaining % 60}s."
                )

    # ── Daily face verification cap (Redis-backed, distributed) ─
    if not await redis_daily_counter.check_and_increment(str(voter.voter_id), settings.FACE_DAILY_LIMIT):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You have exceeded the maximum number of face verification attempts for today. Please try again tomorrow."
        )

    # ── Election check (uses PhaseEngine for consistency with cast_vote) ──
    if not election or not PhaseEngine.is_voting_allowed(election):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voting is not currently open.")

    # ── Anti-replay token ──────────────────────────────────────
    from app.security.anti_replay_service import AntiReplayService
    is_valid = await AntiReplayService.validate_and_consume(body.anti_replay_token, voter_id, db, consume=False)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification session token. Please re-verify your ID."
        )

    # ── Frame count validation ─────────────────────────────────
    num_frames = len(body.frames)
    if num_frames < 3 or num_frames > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Expected 3–10 frames, got {num_frames}."
        )

    # ── Check enrolled template exists ────────────────────────
    if not voter.face_encoding:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No enrolled face template found. Please register your face first."
        )

    stored_emb = deserialize_embedding(voter.face_encoding)
    ip_addr = extract_client_ip(request)

    async def log_passive_failed(reason: str):
        fail_audit = AuditLog(
            event_type="FACE_VERIFICATION_FAILED",
            actor_id=voter.voter_id,
            description=f"User Agent: {user_agent} | Election ID: {election_id_str} | Passive face verification failed: {reason}",
            ip_address=ip_addr,
            created_at=datetime.now(timezone.utc)
        )
        db.add(fail_audit)
        await db.commit()

    # ── Per-frame processing ───────────────────────────────────
    from app.services.face_service import (
        replay_cache,
        assess_frame_quality,
        enhance_frame,
    )
    import cv2
    import numpy as np

    frames_bgr = []
    embeddings = []
    decode_errors = 0
    replay_detected = False
    multiple_faces_detected = False
    evaluated_frames = []

    try:
        for idx, frame_b64 in enumerate(body.frames):
            # Decode base64
            try:
                if "," in frame_b64:
                    _, encoded = frame_b64.split(",", 1)
                else:
                    encoded = frame_b64
                image_data = base64.b64decode(encoded)
            except Exception:
                decode_errors += 1
                logger.warning(f"Passive verify: frame {idx} decode error for voter {voter.college_email}")
                continue

            if len(image_data) > 10 * 1024 * 1024:
                decode_errors += 1
                logger.warning(f"Passive verify: frame {idx} too large for voter {voter.college_email}")
                continue

            # Per-frame replay protection
            if replay_cache.is_replay_and_add(image_data):
                logger.warning(f"Passive verify: replay detected on frame {idx} for voter {voter.college_email}")
                replay_detected = True
                break

            # Normalize image to opencv bgr
            try:
                img_bgr = normalize_image(image_data)
            except ValueError as ve:
                logger.info(f"Passive verify: frame {idx} normalization error — {ve}")
                decode_errors += 1
                continue

            # Quality Assessment
            q = assess_frame_quality(img_bgr)
            
            # Check for multiple faces
            if q["has_face"] and q.get("face_count", 1) > 1:
                multiple_faces_detected = True
                logger.warning(f"Passive verify: multiple faces ({q['face_count']}) detected on frame {idx} for voter {voter.college_email}")
                break

            # Add index and reference of normalized frame
            q["idx"] = idx
            q["img_bgr"] = img_bgr
            q["image_data"] = image_data
            evaluated_frames.append(q)

        # Replay validation check
        if replay_detected:
            audit_entry = AuditLog(
                event_type="PASSIVE_BIOMETRIC_REPLAY_DETECTED",
                actor_id=voter.voter_id,
                description="Passive liveness replay detected",
                ip_address=ip_addr,
                created_at=datetime.now(timezone.utc)
            )
            db.add(audit_entry)
            await db.commit()
            await log_passive_failed("Replay detected")
            await increment_face_attempts_with_lock(db, voter_id)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Replay attack detected. Please try again.",
                    "match_score": 0.0
                }
            )

        # Multiple faces check
        if multiple_faces_detected:
            audit_entry = AuditLog(
                event_type="PASSIVE_BIOMETRIC_MULTIPLE_FACES",
                actor_id=voter.voter_id,
                description="Multiple faces detected in frame sequence",
                ip_address=ip_addr,
                created_at=datetime.now(timezone.utc)
            )
            db.add(audit_entry)
            await db.commit()
            await log_passive_failed("Multiple faces detected")
            await increment_face_attempts_with_lock(db, voter_id)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Multiple faces detected. Ensure only one person is in the frame.",
                    "match_score": 0.0
                }
            )

        # Face disappearance check (face missing in 3 or more frames out of 10, or >= 30% of frames)
        total_processed = len(evaluated_frames)
        missing_faces = sum(1 for f in evaluated_frames if not f["has_face"])
        if total_processed > 0 and (missing_faces / total_processed) >= 0.3:
            audit_entry = AuditLog(
                event_type="PASSIVE_BIOMETRIC_FACE_DISAPPEARED",
                actor_id=voter.voter_id,
                description=f"Face disappeared during frame sequence capture (missing in {missing_faces}/{total_processed} frames)",
                ip_address=ip_addr,
                created_at=datetime.now(timezone.utc)
            )
            db.add(audit_entry)
            await db.commit()
            await log_passive_failed("Face disappeared")
            await increment_face_attempts_with_lock(db, voter_id)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Face disappeared from camera view. Please hold still during capture.",
                    "match_score": 0.0
                }
            )

        # Filter out frames with no faces
        frames_with_faces = [f for f in evaluated_frames if f["has_face"]]
        if not frames_with_faces:
            audit_entry = AuditLog(
                event_type="PASSIVE_BIOMETRIC_NO_FACE",
                actor_id=voter.voter_id,
                description="No face detected in any of the submitted frames",
                ip_address=ip_addr,
                created_at=datetime.now(timezone.utc)
            )
            db.add(audit_entry)
            await db.commit()
            await log_passive_failed("No face detected")
            await increment_face_attempts_with_lock(db, voter_id)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Face not detected. Ensure you are directly in front of the camera.",
                    "match_score": 0.0
                }
            )

        # Calculate quality scores
        for f in frames_with_faces:
            brightness_dev = abs(f["brightness"] - 125.0)
            brightness_points = max(0.0, 100.0 - brightness_dev)
            blur_points = min(100.0, f["blur"])
            contrast_points = min(100.0, f["contrast"] * 1.5)
            centered_points = f["centeredness"]
            size_points = min(100.0, f["face_size"] * 4.0)
            f["quality_score"] = brightness_points + blur_points + contrast_points + centered_points + size_points

        # Sort descending by quality score
        frames_with_faces.sort(key=lambda x: x["quality_score"], reverse=True)

        # Discard POOR frames
        valid_frames = [f for f in frames_with_faces if f["classification"] != "POOR"]

        # Failure analysis if we have less than 3 valid frames
        if len(valid_frames) < 3:
            avg_brightness = np.mean([f["brightness"] for f in frames_with_faces])
            avg_blur = np.mean([f["blur"] for f in frames_with_faces])
            avg_centeredness = np.mean([f["centeredness"] for f in frames_with_faces])
            avg_size = np.mean([f["face_size"] for f in frames_with_faces])

            if avg_brightness < 40.0:
                guidance = "Improve lighting. Your face is too dark."
            elif avg_brightness > 220.0:
                guidance = "Improve lighting. Your face is overexposed."
            elif avg_blur < 12.0:
                guidance = "Hold steady. Your camera capture is too blurry."
            elif avg_centeredness < 45.0:
                guidance = "Center your face in the camera frame."
            elif avg_size < 5.0:
                guidance = "Move closer to the camera."
            else:
                guidance = "Unable to verify live face. Ensure good lighting and try again."

            logger.warning(f"PASSIVE_INSUFFICIENT_QUALITY voter={voter.college_email} valid={len(valid_frames)} faces={len(frames_with_faces)} guidance={guidance}")
            new_count, lockout_minutes = await increment_face_attempts_with_lock(db, voter_id)
            audit_entry = AuditLog(
                event_type="PASSIVE_BIOMETRIC_LOW_QUALITY",
                actor_id=voter.voter_id,
                description=f"Passive liveness rejected due to low quality: {guidance}",
                ip_address=ip_addr,
                created_at=datetime.now(timezone.utc)
            )
            db.add(audit_entry)
            await log_passive_failed(f"Insufficient valid frames: {guidance}")
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": guidance,
                    "match_score": 0.0
                }
            )

        # Select Top 3 highest-quality frames
        top_frames = valid_frames[:3]

        # For these top 3 frames, apply enhancement if their classification is ACCEPTABLE
        final_frames_bgr = []
        final_embeddings = []
        frame_metrics_list = []
        stored_emb = deserialize_embedding(voter.face_encoding)

        for f in top_frames:
            img = f["img_bgr"]
            if f["classification"] == "ACCEPTABLE":
                img = enhance_frame(img, "ACCEPTABLE")
                
            final_frames_bgr.append(img)
            
            # Re-encode enhanced img back to bytes for ArcFace embedding extraction
            success_encode, encoded_buf = cv2.imencode(".jpg", img)
            if not success_encode:
                logger.error("Failed to re-encode enhanced frame to JPEG")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to process enhanced frame."
                )
            
            try:
                emb = await extract_face_embedding(encoded_buf.tobytes(), rate_limit_key=None)
                final_embeddings.append(emb)
            except Exception as ve:
                logger.error(f"Failed to extract face embedding from enhanced frame: {ve}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "message": "Unable to verify live face. Captured face is not clear.",
                        "match_score": 0.0
                    }
                )

            # Compare with enrolled photo to get similarity score
            emb_arr = np.asarray(emb, dtype=np.float32)
            stored_arr = np.asarray(stored_emb, dtype=np.float32)
            norm_a = np.linalg.norm(emb_arr)
            norm_b = np.linalg.norm(stored_arr)
            similarity = 0.0
            if norm_a > 0 and norm_b > 0:
                similarity = float(np.dot(emb_arr, stored_arr) / (norm_a * norm_b))
                
            frame_metrics_list.append({
                "blur": f["blur"],
                "brightness": f["brightness"],
                "contrast": f["contrast"],
                "face_size": f["face_size"],
                "similarity": round(similarity * 100, 1)
            })

            # Log debug metrics for every selected frame (blur, brightness, contrast, face_size, similarity)
            logger.info(
                f"DEBUG_FRAME_METRICS voter={voter.college_email} "
                f"idx={f['idx']} blur={f['blur']} brightness={f['brightness']} "
                f"contrast={f['contrast']} face_size={f['face_size']} "
                f"similarity={similarity * 100:.1f}%"
            )

        # ── Passive liveness checks on the selected frames ──────────
        liveness_passed, internal_reason = check_passive_liveness(final_frames_bgr, final_embeddings)
        if not liveness_passed:
            logger.warning(f"PASSIVE_LIVENESS_FAILURE voter={voter.college_email} reason={internal_reason}")
            new_count, lockout_minutes = await increment_face_attempts_with_lock(
                db, voter_id
            )
            audit_entry = AuditLog(
                event_type="PASSIVE_BIOMETRIC_LIVENESS_FAILED",
                actor_id=voter.voter_id,
                description=f"Passive liveness check failed: {internal_reason}",
                ip_address=ip_addr,
                created_at=datetime.now(timezone.utc)
            )
            db.add(audit_entry)
            await log_passive_failed(f"Liveness check failed: {internal_reason}")
            await db.commit()

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Unable to verify live face. Your face was not detected as a live person. Please ensure good lighting and try again.",
                    "match_score": 0.0
                }
            )

        # ── Multi-frame matching calculation ──────────────────
        similarities = [m["similarity"] for m in frame_metrics_list]
        best_score = float(max(similarities))
        sorted_similarities = sorted(similarities, reverse=True)
        average_top2 = float(np.mean(sorted_similarities[:2])) if len(sorted_similarities) >= 2 else best_score

        cosine_threshold_pct = settings.FACE_MATCH_COSINE_THRESHOLD * 100.0
        match_passed = (average_top2 >= cosine_threshold_pct) or (best_score >= (cosine_threshold_pct + 5.0))

        logger.info(
            f"FACE_MATCH_DEBUG "
            f"voter={voter.college_email} "
            f"match_passed={match_passed} "
            f"similarities={similarities} "
            f"best_score={best_score:.1f}% "
            f"average_top2={average_top2:.1f}% "
            f"threshold_pct={cosine_threshold_pct:.1f}%"
        )

        if not match_passed:
            logger.warning(
                f"FACE_MATCH_FAILURE voter={voter.college_email} "
                f"best_score={best_score:.1f}%, average_top2={average_top2:.1f}% "
                f"(threshold: {cosine_threshold_pct:.1f}%)"
            )
            new_count, lockout_minutes = await increment_face_attempts_with_lock(
                db, voter_id
            )
            audit_entry = AuditLog(
                event_type="PASSIVE_BIOMETRIC_VERIFY_FAILURE",
                actor_id=voter.voter_id,
                description=f"Passive face verification failed: best_score={best_score:.1f}%, average_top2={average_top2:.1f}%",
                ip_address=ip_addr,
                created_at=datetime.now(timezone.utc)
            )
            db.add(audit_entry)
            await log_passive_failed(f"Face comparison mismatch (best_score: {best_score:.1f}%, average_top2: {average_top2:.1f}%)")
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": f"Face match below threshold ({average_top2:.1f}%). Captured face does not match enrolled photo.",
                    "match_score": average_top2
                }
            )

        # ── Success — issue face_session_token ────────────────
        voter.failed_face_attempts = 0
        voter.lockout_until = None
        await redis_face_lockout.clear_lockout(str(voter.voter_id))

        device_fingerprint = request.headers.get("x-device-fingerprint") or "unknown_device"
        ip_hash = hashlib.sha256(ip_addr.encode("utf-8")).hexdigest()
        fp_hash = hashlib.sha256(device_fingerprint.encode("utf-8")).hexdigest()

        jti = str(uuid.uuid4())
        nonce = secrets.token_hex(16)
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)

        payload = {
            "sub": str(voter.voter_id),
            "aud": "vote_system",
            "purpose": "face_cast",
            "jti": jti,
            "nonce": nonce,
            "ip": ip_hash,
            "fp": fp_hash,
            "exp": expire,
            "iat": datetime.now(timezone.utc)
        }
        face_session_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        await redis_biometric_token_cache.register_token(jti, str(voter.voter_id))

        logger.info(f"PASSIVE_BIOMETRIC_SUCCESS voter={voter.college_email} best_score={best_score:.1f}% average_top2={average_top2:.1f}%")

        audit_success = AuditLog(
            event_type="PASSIVE_BIOMETRIC_VERIFY_SUCCESS",
            actor_id=voter.voter_id,
            description=f"Passive face verification successful: best_score={best_score:.1f}%, average_top2={average_top2:.1f}%",
            ip_address=ip_addr,
            created_at=datetime.now(timezone.utc)
        )
        db.add(audit_success)

        success_audit = AuditLog(
            event_type="FACE_VERIFICATION_SUCCESS",
            actor_id=voter.voter_id,
            description=f"User Agent: {user_agent} | Election ID: {election_id_str} | Passive face verification successful (average top 2 score: {average_top2:.1f}%)",
            ip_address=ip_addr,
            created_at=datetime.now(timezone.utc)
        )
        db.add(success_audit)
        await db.commit()

        return {
            "success": True,
            "face_session_token": face_session_token,
            "expires_in_seconds": 900,
            "anti_replay_token": body.anti_replay_token,
            "match_score": average_top2,
            "best_score": best_score,
            "average_top2": average_top2,
            "frame_scores": similarities,
        }
    finally:
        # Safe memory cleanup — release all frame and embedding references
        for i in range(len(frames_bgr)):
            frames_bgr[i] = None
        for i in range(len(embeddings)):
            embeddings[i] = None
        del frames_bgr, embeddings
        _gc.collect()


@router.post("/verify-face")
@limiter.limit("5/10minute")
async def verify_face(
    request: Request,
    body: FaceVerifyRequest,
    current_user: dict = Depends(get_voting_session),
    db: AsyncSession = Depends(get_db)
):
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    # Fetch active election first to get election_id for logging
    # Must filter by VOTING_OPEN so we always pick the election that is actually open for voting.
    election_query = (
        select(Election)
        .where(Election.status == ElectionStatusEnum.VOTING_OPEN)
        .order_by(Election.created_at.desc())
    )
    election_result = await db.execute(election_query)
    election = election_result.scalars().first()
    election_id_str = str(election.election_id) if election else "None"

    # Log FACE_VERIFICATION_STARTED
    user_agent = request.headers.get("user-agent", "unknown")
    ip_addr = extract_client_ip(request)
    start_audit = AuditLog(
        event_type="FACE_VERIFICATION_STARTED",
        actor_id=uuid.UUID(voter_id) if isinstance(voter_id, str) else voter_id,
        description=f"User Agent: {user_agent} | Election ID: {election_id_str} | Active face verification started",
        ip_address=ip_addr,
        created_at=datetime.now(timezone.utc)
    )
    db.add(start_audit)
    await db.commit()

    async def log_face_failed(reason: str):
        fail_audit = AuditLog(
            event_type="FACE_VERIFICATION_FAILED",
            actor_id=uuid.UUID(voter_id) if isinstance(voter_id, str) else voter_id,
            description=f"User Agent: {user_agent} | Election ID: {election_id_str} | Active face verification failed: {reason}",
            ip_address=ip_addr,
            created_at=datetime.now(timezone.utc)
        )
        db.add(fail_audit)
        await db.commit()

    # ── Early lockout check (Redis-backed, distributed) ──────────
    redis_locked, redis_remaining = await redis_face_lockout.check_lockout(str(voter_id))
    if redis_locked and redis_remaining is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Face verification is locked. Try again in {redis_remaining // 60}m {redis_remaining % 60}s."
        )

    # Fetch voter details
    query = select(Voter).where(Voter.voter_id == voter_id)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()
    if not voter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter profile not found.")

    # Validate voter has not already voted
    if voter.has_voted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You have already cast your vote.")

    # Enforce Lockouts (DB fallback — used when Redis was unavailable)
    now = datetime.now(timezone.utc)
    if not redis_locked:
        if voter.lockout_until:
            lockout_until = voter.lockout_until
            if lockout_until.tzinfo is None:
                lockout_until = lockout_until.replace(tzinfo=timezone.utc)
            if now < lockout_until:
                remaining = int((lockout_until - now).total_seconds())
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Face verification is locked. Try again in {remaining // 60}m {remaining % 60}s."
                )

    # ── Daily face verification cap (Redis-backed, distributed) ─
    if not await redis_daily_counter.check_and_increment(str(voter.voter_id), settings.FACE_DAILY_LIMIT):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You have exceeded the maximum number of face verification attempts for today. Please try again tomorrow."
        )

    if not election or not PhaseEngine.is_voting_allowed(election):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voting is not currently open.")

    # Validate election verification code token (already passed verify-id)
    from app.security.anti_replay_service import AntiReplayService
    is_valid = await AntiReplayService.validate_and_consume(body.anti_replay_token, voter_id, db, consume=False)
    if not is_valid:
        await log_face_failed("Invalid or expired verification session token")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification session token. Please re-verify your ID.")

    # Decode face image
    try:
        if "," in body.live_face_image:
            header, encoded = body.live_face_image.split(",", 1)
        else:
            encoded = body.live_face_image
        image_data = base64.b64decode(encoded)
    except Exception:
        await log_face_failed("Invalid face image format")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid face image format.")

    if len(image_data) > 10 * 1024 * 1024:
        await log_face_failed("Image size exceeds 10MB limit")
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Image size exceeds 10MB limit.")

    # Replay Protection: SHA256 of image frame
    from app.services.face_service import replay_cache
    if replay_cache.is_replay_and_add(image_data):
        logger.warning(f"Biometric replay attack attempt detected for voter: {voter.college_email}")
        audit_entry = AuditLog(
            event_type="BIOMETRIC_REPLAY_DETECTED",
            actor_id=voter.voter_id,
            description=f"Voter {voter.full_name} biometric replay check failed (identical image submitted)",
            ip_address=ip_addr,
            created_at=datetime.now(timezone.utc)
        )
        db.add(audit_entry)
        await log_face_failed("Replay detected")
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Biometric verification failed (replay detected).")

    # Perform liveness, normalization & quality checks
    try:
        live_emb = await extract_face_embedding(image_data, rate_limit_key=str(voter.voter_id))
    except ValueError as ve:
        new_count, lockout_minutes = await increment_face_attempts_with_lock(
            db, voter_id
        )
        description = f"Biometric verification poor quality/liveness failed: {ve}"
        logger.warning(f"Voter {voter.college_email} quality failed: {ve}")

        audit_entry = AuditLog(
            event_type="BIOMETRIC_POOR_QUALITY",
            actor_id=voter.voter_id,
            description=description,
            ip_address=ip_addr,
            created_at=datetime.now(timezone.utc)
        )
        db.add(audit_entry)

        if lockout_minutes:
            logger.warning(f"Voter {voter.college_email} locked out for {lockout_minutes} min due to failed face attempts.")
            audit_lockout = AuditLog(
                event_type="BIOMETRIC_LOCKOUT_TRIGGERED",
                actor_id=voter.voter_id,
                description=f"Voter locked out for {lockout_minutes} minutes due to {new_count} consecutive biometric verification failures.",
                ip_address=ip_addr,
                created_at=datetime.now(timezone.utc)
            )
            db.add(audit_lockout)

        await log_face_failed(f"Poor quality/liveness failed: {ve}")
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))

    # Match ArcFace template
    if not voter.face_encoding:
        await log_face_failed("No enrolled face template found")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No enrolled face template found. Please register your face first.")

    stored_emb = deserialize_embedding(voter.face_encoding)
    if not compare_face_embeddings(live_emb, stored_emb):
        new_count, lockout_minutes = await increment_face_attempts_with_lock(
            db, voter_id
        )
        logger.warning(f"Voter {voter.college_email} biometric comparison mismatch.")

        audit_entry = AuditLog(
            event_type="BIOMETRIC_VERIFY_FAILURE",
            actor_id=voter.voter_id,
            description="Face verification failed (biometric template mismatch)",
            ip_address=ip_addr,
            created_at=datetime.now(timezone.utc)
        )
        db.add(audit_entry)

        if lockout_minutes:
            logger.warning(f"Voter {voter.college_email} locked out for {lockout_minutes} min due to mismatch failures.")
            audit_lockout = AuditLog(
                event_type="BIOMETRIC_LOCKOUT_TRIGGERED",
                actor_id=voter.voter_id,
                description=f"Voter locked out for {lockout_minutes} minutes due to {new_count} consecutive biometric verification failures.",
                ip_address=ip_addr,
                created_at=datetime.now(timezone.utc)
            )
            db.add(audit_lockout)

        await log_face_failed("Face template comparison mismatch")
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Face verification failed. Captured face does not match registered student photo.")

    # Success: reset lockout, issue face session token
    voter.failed_face_attempts = 0
    voter.lockout_until = None
    await redis_face_lockout.clear_lockout(str(voter.voter_id))

    ip_addr = extract_client_ip(request)
    device_fingerprint = request.headers.get("x-device-fingerprint") or "unknown_device"

    ip_hash = hashlib.sha256(ip_addr.encode("utf-8")).hexdigest()
    fp_hash = hashlib.sha256(device_fingerprint.encode("utf-8")).hexdigest()

    jti = str(uuid.uuid4())
    nonce = secrets.token_hex(16)
    expire = datetime.now(timezone.utc) + timedelta(minutes=15)

    payload = {
        "sub": str(voter.voter_id),
        "aud": "vote_system",
        "purpose": "face_cast",
        "jti": jti,
        "nonce": nonce,
        "ip": ip_hash,
        "fp": fp_hash,
        "exp": expire,
        "iat": datetime.now(timezone.utc)
    }
    face_session_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    # Register token in unconsumed cache
    await redis_biometric_token_cache.register_token(jti, str(voter.voter_id))

    # Logs & Audits
    logger.info(f"Biometric token issued successfully for voter {voter.college_email}")
    audit_entry = AuditLog(
        event_type="BIOMETRIC_VERIFY_SUCCESS",
        actor_id=voter.voter_id,
        description="Face verification successful",
        ip_address=ip_addr,
        created_at=datetime.now(timezone.utc)
    )
    db.add(audit_entry)

    audit_token = AuditLog(
        event_type="BIOMETRIC_TOKEN_ISSUED",
        actor_id=voter.voter_id,
        description=f"Issued face_session_token with JTI: {jti}",
        ip_address=ip_addr,
        created_at=datetime.now(timezone.utc)
    )
    db.add(audit_token)

    # Log FACE_VERIFICATION_SUCCESS
    success_audit = AuditLog(
        event_type="FACE_VERIFICATION_SUCCESS",
        actor_id=voter.voter_id,
        description=f"User Agent: {user_agent} | Election ID: {election_id_str} | Active face verification successful (match score: 100%)",
        ip_address=ip_addr,
        created_at=datetime.now(timezone.utc)
    )
    db.add(success_audit)

    await db.commit()

    return {
        "success": True,
        "face_session_token": face_session_token,
        "expires_in_seconds": 900,
        "anti_replay_token": body.anti_replay_token,
    }


@router.post("/cast")
@limiter.limit("5/minute")
async def cast_vote(
    request: Request,
    body: VoteCastRequest,
    current_user: dict = Depends(get_voting_session),
    db: AsyncSession = Depends(get_db),
):
    """Cast a vote for a candidate securely and send SMS/email confirmations."""
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    # Fetch voter details
    query = select(Voter).where(Voter.voter_id == voter_id)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voter profile not found."
        )

    # Fetch the active election — filter by VOTING_OPEN status so we always
    # pick the election that is actually open for voting (not just the latest created).
    election_query = (
        select(Election)
        .where(Election.status == ElectionStatusEnum.VOTING_OPEN)
        .order_by(Election.created_at.desc())
    )
    election_result = await db.execute(election_query)
    election = election_result.scalars().first()

    if not election:
        # Check if any election exists at all (might be in a different status)
        any_elec_res = await db.execute(
            select(Election).order_by(Election.created_at.desc())
        )
        any_election = any_elec_res.scalars().first()
        if not any_election:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active election found. Please contact the election admin."
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Voting is not currently open."
        )

    # Extract client metadata for audit logging
    user_agent = request.headers.get("user-agent", "unknown")
    ip_addr = extract_client_ip(request)
    election_id_str = str(election.election_id) if election else "None"

    # Log VOTE_SUBMISSION_STARTED
    start_audit = AuditLog(
        event_type="VOTE_SUBMISSION_STARTED",
        actor_id=voter.voter_id,
        description=f"User Agent: {user_agent} | Election ID: {election_id_str} | Vote submission started",
        ip_address=ip_addr,
        created_at=datetime.now(timezone.utc)
    )
    db.add(start_audit)
    await db.commit()

    async def log_cast_failed(reason: str):
        try:
            fail_audit = AuditLog(
                event_type="VOTE_CAST_FAILED",
                actor_id=voter.voter_id,
                description=f"User Agent: {user_agent} | Election ID: {election_id_str} | Vote cast failed: {reason}",
                ip_address=ip_addr,
                created_at=datetime.now(timezone.utc)
            )
            db.add(fail_audit)
            await db.commit()
        except Exception as log_err:
            logger.error(f"Failed to log vote cast failure: {log_err}")

    # Wrap validation in a try block to handle logging cast failure
    try:
        # Call vote validator
        from app.validators.vote_validator import validate_vote_submission
        is_valid, err_msg = await validate_vote_submission(db, election, voter)
        if not is_valid:
            logger.warning(
                f"VOTE_CAST_REJECT_VALIDATOR "
                f"voter_id={voter_id} "
                f"reason={err_msg}"
            )
            status_code = status.HTTP_400_BAD_REQUEST
            if "permission" in err_msg:
                status_code = status.HTTP_403_FORBIDDEN
            elif "not found" in err_msg:
                status_code = status.HTTP_404_NOT_FOUND
            await log_cast_failed(err_msg)
            raise HTTPException(status_code=status_code, detail=err_msg)

        # ── Verification ID Check ────────────────────────────────
        from app.security.password_service import verify_password
        if not voter.verification_id:
            await log_cast_failed("No verification ID set on account")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No verification ID set for your account. Contact the election admin."
            )
        if not verify_password(body.verification_id, voter.verification_id):
            await log_cast_failed("Verification ID does not match")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Verification ID does not match. Please re-enter your verification code."
            )

        # ── Face Verification ────────────────────────────────────
        biometric_token_jti = None
        biometric_token_ip = None
        if settings.ENABLE_FACE_VERIFICATION and voter.face_encoding:
            if not body.face_session_token:
                await log_cast_failed("Biometric face token is required to cast a vote.")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Biometric face token is required to cast a vote."
                )
                
            try:
                payload = jwt.decode(
                    body.face_session_token,
                    settings.JWT_SECRET_KEY,
                    audience="vote_system",
                    algorithms=[settings.JWT_ALGORITHM]
                )
            except jwt.ExpiredSignatureError:
                await log_cast_failed("Biometric verification token has expired. Please verify face again.")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Biometric verification token has expired. Please verify face again."
                )
            except jwt.PyJWTError as e:
                await log_cast_failed(f"Invalid biometric session token: {e}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Invalid biometric session token: {e}"
                )
                
            if payload.get("purpose") != "face_cast":
                await log_cast_failed("Invalid token purpose.")
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token purpose.")
                
            if payload.get("sub") != str(voter_id):
                await log_cast_failed("Biometric token voter ID mismatch.")
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Biometric token voter ID mismatch.")
                
            device_fingerprint = request.headers.get("x-device-fingerprint") or "unknown_device"
            
            expected_ip_hash = hashlib.sha256(ip_addr.encode("utf-8")).hexdigest()
            expected_fp_hash = hashlib.sha256(device_fingerprint.encode("utf-8")).hexdigest()
            
            if payload.get("ip") != expected_ip_hash:
                await log_cast_failed("Biometric session IP mismatch. Security validation failed.")
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Biometric session IP mismatch. Security validation failed.")
            if payload.get("fp") != expected_fp_hash:
                await log_cast_failed("Biometric session device mismatch. Security validation failed.")
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Biometric session device mismatch. Security validation failed.")
                
            jti = payload.get("jti")
            if not jti or not await redis_biometric_token_cache.validate(jti, str(voter_id)):
                await log_cast_failed("Biometric token has already been consumed or is invalid.")
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Biometric token has already been consumed or is invalid.")
            biometric_token_jti = jti
            biometric_token_ip = ip_addr
        elif voter.face_encoding:
            # Fallback to old face verification inline if face verification flag is disabled but image provided
            if not body.live_face_image:
                await log_cast_failed("Live face image is required for identity verification.")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Live face image is required for identity verification."
                )
            try:
                if "," in body.live_face_image:
                    header, encoded = body.live_face_image.split(",", 1)
                else:
                    encoded = body.live_face_image
                image_data = base64.b64decode(encoded)
            except Exception:
                await log_cast_failed("Invalid face image format.")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid face image format."
                )
                
            try:
                live_emb = await extract_face_embedding(image_data, rate_limit_key=str(voter.voter_id))
                stored_emb = deserialize_embedding(voter.face_encoding)
                
                if not compare_face_embeddings(live_emb, stored_emb):
                    raise ValueError(
                        "Face verification failed. Captured face does not match registered student photo."
                    )
            except ValueError as ve:
                await log_cast_failed(str(ve))
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(ve)
                )
            except RuntimeError as re:
                await log_cast_failed(str(re))
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=str(re)
                )
            except ImportError:
                await log_cast_failed("Face verification temporarily unavailable")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Face verification is temporarily unavailable. The face recognition module is not fully installed on the server."
                )
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Face verification failed unexpectedly: {e}")
                await log_cast_failed(f"Face verification failed unexpectedly: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Face verification encountered an unexpected error. Please try again or contact the election admin."
                )

        candidate = None
        position_id = None
        
        if body.candidate_id:
            try:
                cand_uuid = uuid.UUID(body.candidate_id)
            except ValueError:
                await log_cast_failed("Invalid candidate ID format")
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid candidate ID format")

            candidate_query = select(Candidate).where(Candidate.candidate_id == cand_uuid)
            cand_result = await db.execute(candidate_query)
            candidate = cand_result.scalar_one_or_none()
            if not candidate:
                await log_cast_failed("Selected candidate not found")
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Selected candidate not found")

            # Verify candidate belongs to the active election
            if str(candidate.election_id) != str(election.election_id):
                await log_cast_failed("Selected candidate does not belong to active election")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, 
                    detail="Selected candidate does not belong to the active election."
                )
            
            position_id = candidate.position_id
        else:
            # Voted NOTA. Fetch the President position ID for the active election
            pos_query = select(Position).where(
                Position.election_id == election.election_id,
                Position.title == "President"
            )
            pos_result = await db.execute(pos_query)
            position_record = pos_result.scalar_one_or_none()
            if not position_record:
                await log_cast_failed("President position not found")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, 
                    detail="President position not found in this election."
                )
            position_id = position_record.position_id

        # ── Anti-Replay Token Verification (Early check, consume=False) ──
        if not body.anti_replay_token:
            await log_cast_failed("Anti-replay token is missing")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Anti-replay token is missing."
            )
        from app.security.anti_replay_service import AntiReplayService
        is_token_valid = await AntiReplayService.validate_and_consume(body.anti_replay_token, voter_id, db, consume=False)
        if not is_token_valid:
            await log_cast_failed("Invalid or expired anti-replay token")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired anti-replay token. Please verify your ID again."
            )

    except HTTPException:
        # Re-raise HTTPExceptions directly
        raise
    except Exception as e:
        logger.error(f"Unexpected error before cast transaction: {e}")
        await log_cast_failed(f"Unexpected error before transaction: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    # Generate cryptographic anonymous token hash
    random_token = str(uuid.uuid4())
    voter_token_hash = hashlib.sha256(random_token.encode("utf-8")).hexdigest()

    from sqlalchemy import func, text
    from app.services.ledger_service import calculate_vote_hash, append_to_secure_vault

    # ═══════════════════════════════════════════════════════════
    # CRITICAL SECTION — row lock + atomic sequence
    # ═══════════════════════════════════════════════════════════

    is_sqlite = db.bind.dialect.name == "sqlite"
    lock = get_sqlite_lock() if is_sqlite else None
    if lock:
        await lock.acquire()

    try:
        # Lock/Retrieve the voter row and check has_voted
        locked_voter = await db.get(Voter, voter_id)

        if locked_voter is None:
            raise HTTPException(
                status_code=404,
                detail="Voter not found"
            )

        if locked_voter.has_voted:
            raise HTTPException(
                status_code=409,
                detail="Vote already recorded."
            )

        # Acquire DB row lock if not SQLite
        if not is_sqlite:
            lock_query = select(Voter).where(Voter.voter_id == voter_id).with_for_update()
            await db.execute(lock_query)

        # Get next ledger sequence atomically
        try:
            seq_result = await db.execute(text("SELECT nextval('votes_ledger_sequence_seq')"))
            next_seq = seq_result.scalar()
        except Exception as seq_err:
            # If the sequence query fails (e.g. sequence doesn't exist), the
            # PostgreSQL transaction is aborted. We MUST rollback before any
            # further queries on this session.
            # For SQLite, skip rollback to avoid greenlet context loss.
            logger.warning(f"Sequence query failed, using fallback: {seq_err}")
            if not is_sqlite:
                await db.rollback()
            # Fallback for SQLite/Test environments or missing sequence
            seq_query = select(func.max(Vote.ledger_sequence))
            seq_result = await db.execute(seq_query)
            max_seq = seq_result.scalar() or 0
            next_seq = max_seq + 1

        # Compute previous hash from the preceding committed vote
        previous_hash = None
        if next_seq > 1:
            prev_query = select(Vote.current_hash).where(Vote.ledger_sequence == next_seq - 1)
            prev_result = await db.execute(prev_query)
            previous_hash = prev_result.scalar()

        # Generate timestamp string
        now_utc = datetime.now(timezone.utc)
        timestamp_str = now_utc.replace(tzinfo=None).isoformat()

        # Generate current hash
        current_hash = await calculate_vote_hash(
            candidate_id=str(candidate.candidate_id) if candidate else None,
            timestamp_utc=timestamp_str,
            election_id=str(election.election_id),
            previous_hash=previous_hash,
            ledger_sequence=next_seq
        )

        # Create anonymous vote
        # NOTE: Use uuid.UUID objects for Uuid(as_uuid=True) columns.
        new_vote = Vote(
            vote_id=uuid.uuid4(),
            voter_token_hash=voter_token_hash,
            candidate_id=candidate.candidate_id if candidate else None,
            election_id=election.election_id,
            position_id=position_id,
            previous_hash=previous_hash,
            current_hash=current_hash,
            ledger_sequence=next_seq,
            timestamp_utc=now_utc
        )
        
        db.add(new_vote)

        # Mark voter as having voted (under the same lock)
        locked_voter.has_voted = True

        # Log VOTE_CAST_SUCCESS (part of the transaction)
        success_audit = AuditLog(
            event_type="VOTE_CAST_SUCCESS",
            actor_id=voter.voter_id,
            description=f"User Agent: {user_agent} | Election ID: {election_id_str} | Vote cast successfully",
            ip_address=ip_addr,
            created_at=datetime.now(timezone.utc)
        )
        db.add(success_audit)

        # Consume the anti-replay token (commits everything)
        is_token_consumed = await AntiReplayService.validate_and_consume(body.anti_replay_token, voter_id, db, consume=True)
        if not is_token_consumed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to consume anti-replay token."
            )

    except Exception as e:
        await db.rollback()
        # Log VOTE_CAST_FAILED
        try:
            fail_audit = AuditLog(
                event_type="VOTE_CAST_FAILED",
                actor_id=voter.voter_id,
                description=f"User Agent: {user_agent} | Election ID: {election_id_str} | Vote cast failed: {str(e)}",
                ip_address=ip_addr,
                created_at=datetime.now(timezone.utc)
            )
            db.add(fail_audit)
            await db.commit()
        except Exception as log_err:
            logger.error(f"Failed to log vote cast failure: {log_err}")
        
        if lock and lock.locked():
            lock.release()
        raise
    finally:
        if lock and lock.locked():
            lock.release()

    if biometric_token_jti:
        consumed = await redis_biometric_token_cache.consume(biometric_token_jti, str(voter_id))
        if not consumed:
            logger.warning(
                f"BIOMETRIC_TOKEN_POST_COMMIT_CONSUME_FAILED voter_id={voter_id} jti={biometric_token_jti}"
            )
        else:
            audit_consume = AuditLog(
                event_type="BIOMETRIC_TOKEN_CONSUMED",
                actor_id=voter.voter_id,
                description=f"Consumed face_session_token with JTI: {biometric_token_jti}",
                ip_address=biometric_token_ip,
                created_at=datetime.now(timezone.utc)
            )
            db.add(audit_consume)
            try:
                await db.commit()
            except Exception as e:
                await db.rollback()
                logger.error(f"Failed to commit biometric token consumption audit log: {e}")

    logger.info(
        f"VOTE_CAST_SUCCESS "
        f"voter_id={voter_id} "
        f"email={voter.college_email} "
        f"candidate_id={str(candidate.candidate_id) if candidate else None} "
        f"election_id={str(election.election_id)} "
        f"ledger_sequence={next_seq} "
        f"previous_hash={previous_hash} "
        f"current_hash={current_hash}"
    )

    # Append to secure vault
    vote_data = {
        "ledger_sequence": next_seq,
        "election_id": str(election.election_id),
        "position_id": str(position_id),
        "candidate_id": str(candidate.candidate_id) if candidate else None,
        "timestamp_utc": timestamp_str
    }
    await append_to_secure_vault(vote_data, current_hash)

    logger.info(f"VOTE_AUDIT_LOG_CREATED voter_id={voter_id} ledger_seq={next_seq}")

    # Trigger Email confirmation (SMS alerts removed per user preference)
    # NOTE: Email is sent synchronously (awaited) to avoid MissingGreenlet
    # errors from asyncio.create_task sharing the DB session with ORM objects.
    if voter.college_email:
        try:
            # Extract ORM values into plain locals BEFORE any f-string or I/O
            # to avoid lazy-load issues on the shared async session.
            voter_email = voter.college_email
            voter_full_name = voter.full_name
            election_title = election.title
            vote_id_str = str(new_vote.vote_id)
            audit_hash_str = current_hash

            # Compute IST timestamp (UTC+5:30)
            now_utc = datetime.now(timezone.utc)
            ist_offset = timedelta(hours=5, minutes=30)
            now_ist = now_utc + ist_offset
            voted_at_ist = now_ist.strftime("%d/%m/%Y, %H:%M:%S") + " IST"

            logger.info(f"[EMAIL] Sending vote confirmation to {voter_email} for election '{election_title}'")

            email_body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; max-width: 540px; margin: auto; padding: 24px;">
                <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 24px; border-radius: 10px 10px 0 0; text-align: center;">
                    <h2 style="color: white; margin: 0; font-size: 20px;">🗳️ Vote Registered Successfully</h2>
                    <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0 0; font-size: 13px;">{election_title}</p>
                </div>
                <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 10px 10px;">
                    <p style="color: #374151; font-size: 16px; margin-top: 0;">Hi <strong>{voter_full_name}</strong>,</p>
                    <p style="color: #374151; font-size: 15px; line-height: 1.5; margin-bottom: 20px;">
                        Your vote has been <strong>successfully cast and permanently recorded</strong> in the blockchain ledger.
                    </p>

                    <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                        <p style="color: #065f46; margin: 0 0 10px 0; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em;">
                            ✅ Vote Receipt
                        </p>
                        <table style="width: 100%; font-size: 12px; color: #374151; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 4px 0; color: #6b7280; white-space: nowrap; padding-right: 12px;">Transaction ID</td>
                                <td style="padding: 4px 0; font-family: monospace; font-size: 11px; word-break: break-all;">{vote_id_str}</td>
                            </tr>
                            <tr>
                                <td style="padding: 4px 0; color: #6b7280; white-space: nowrap; padding-right: 12px;">Audit Hash</td>
                                <td style="padding: 4px 0; font-family: monospace; font-size: 10px; word-break: break-all;">{audit_hash_str}</td>
                            </tr>
                            <tr>
                                <td style="padding: 4px 0; color: #6b7280; white-space: nowrap; padding-right: 12px;">Timestamp</td>
                                <td style="padding: 4px 0; font-family: monospace;">{voted_at_ist}</td>
                            </tr>
                        </table>
                    </div>

                    <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin-bottom: 8px;">
                        🔒 <strong>Your vote is anonymous.</strong> There is no link in the database between your identity and the candidate you voted for.
                    </p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
                        Thank you for participating in the <strong>{election_title}</strong>.
                    </p>
                </div>
            </body>
            </html>
            """

            # Await synchronously instead of asyncio.create_task to avoid
            # MissingGreenlet from ORM object access on the shared session.
            await send_election_email(
                to_email=voter_email,
                recipient_name=voter_full_name,
                subject=f"✅ Vote Registered - {election_title}",
                html_body=email_body
            )
            logger.info(f"[EMAIL] Vote confirmation email sent successfully to {voter_email}")
        except Exception as e:
            logger.error(f"Failed to send vote confirmation email: {e}")

    # ── Fraud and Anomaly Detection ──────────────────────────
    from app.security.fraud_detection_service import FraudDetectionService
    fraud_detector = FraudDetectionService()
    vote_data = {
        "election_id": str(election.election_id),
        "ip_address": ip_addr,
        "submit_time_ms": body.submit_time_ms,
        "trap_data": {
            "verification_field_confirm": body.verification_field_confirm,
            "hidden_field_name": body.hidden_field_name,
            "phone_confirm": body.phone_confirm,
        }
    }
    await fraud_detector.analyze_vote(db, vote_data)

    return {
        "message": "Vote successfully cast!",
        "has_voted": True,
        "vote_id": new_vote.vote_id,
        "current_hash": current_hash,
        "election_name": election.title,
        "timestamp": timestamp_str
    }


@router.post("/upload-photo")
@limiter.limit("5/minute")
async def upload_voter_own_photo(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Voter-facing endpoint to upload/update their own reference photo before voting.
    Only allowed before the voting phase opens.
    """
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    # Fetch voter
    query = select(Voter).where(Voter.voter_id == voter_id)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()
    if not voter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter not found")

    # Phase gate — allow upload if admin has requested re-upload, otherwise only before voting opens
    election_result = await db.execute(
        select(Election).order_by(Election.created_at.desc()).limit(1)
    )
    election = election_result.scalars().first()
    
    # Phase gate — allow upload except when the election is fully closed
    # (photo re-uploads requested by admin bypass this gate entirely)
    if not voter.photo_reupload_requested:
        if election:
            election_status = election.status
            if hasattr(election_status, 'value'):
                election_status = election_status.value
            if election_status == ElectionStatusEnum.CLOSED.value:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Photo can only be updated before voting ends. Contact the election admin if you need to update your photo."
                )

    # Re-upload limit check — max 2 re-upload attempts
    if voter.photo_reupload_count >= 2:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You have reached the maximum of 2 photo re-upload attempts. Please contact the election admin for assistance."
        )

    # Validate file type and size
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Only images are allowed.")

    image_data = await file.read()
    if len(image_data) > 5 * 1024 * 1024:  # 5MB
        raise HTTPException(status_code=400, detail="Image size exceeds 5MB limit.")

    # Validate image (block AI-generated / malicious content)
    validation = validate_image(image_data, file.filename or "face.jpg")
    if not validation.passed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=validation.reason)

    # Extract face embedding
    try:
        embedding = await extract_face_embedding(image_data, rate_limit_key=str(voter.voter_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face recognition is temporarily unavailable. The face recognition module is not fully installed on the server.",
        )
    except Exception as e:
        logger.error(f"Face verification failed unexpectedly during upload: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Face processing encountered an unexpected error. Please try again or contact the election admin.",
        )

    # Save as PENDING — faces/{department}/pending_{usn}_{hash}.jpg
    try:
        saved = await save_voter_face_image(
            voter,
            image_data,
            file.filename or "face.jpg",
            file.content_type or "image/jpeg",
            pending=True,
        )
        voter.pending_image_url = saved.reference_url
        voter.pending_face_encoding = serialize_embedding(embedding)
    except FaceStorageError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Pending face save failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save image file. Please try again.",
        )

    # Increment re-upload count and clear the admin re-upload request flag
    voter.photo_reupload_count += 1
    voter.photo_reupload_requested = False

    # Extract real IP from request (not spoofable by client)
    ip_addr = extract_client_ip(request)

    # Audit log — alert admin that a voter submitted a new photo for review
    audit_entry = AuditLog(
        event_type="PHOTO_UPLOAD_SUBMITTED",
        actor_id=uuid.UUID(voter_id) if isinstance(voter_id, str) else voter_id,
        description=f"Voter {voter.full_name} ({voter.college_email}) submitted a new photo for review ({voter.photo_reupload_count}/2 attempts)",
        ip_address=ip_addr,
        created_at=datetime.now(timezone.utc),
    )
    db.add(audit_entry)

    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to commit voter face data: {e}")
        raise HTTPException(status_code=500, detail="Database error while saving face data.")

    return {
        "success": True,
        "message": f"Photo submitted for admin review ({voter.photo_reupload_count}/2 attempts used). It will be active once approved by the election admin.",
        "pending_image_url": voter.pending_image_url,
    }


@router.get("/status")
async def vote_status(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Check whether the current user has already voted."""
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    query = select(Voter).where(Voter.voter_id == voter_id)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter not found")

    return {
        "has_voted": voter.has_voted,
        "vote_permission": voter.vote_permission
    }


class VoterPermissionUpdateRequest(BaseModel):
    vote_permission: bool


@router.get("/admin/voters", response_model=List[dict])
async def list_voters_for_admin(
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve all voters in the system for admin permission management."""
    query = select(Voter).order_by(Voter.created_at.desc())
    result = await db.execute(query)
    voters = result.scalars().all()
    
    return [
        {
            "voter_id": str(v.voter_id),
            "verification_code": v.verification_code or "—",
            "student_id": v.student_id or "—",
            "full_name": v.full_name,
            "college_email": v.college_email,
            "department": v.department or "—",
            "year_of_study": v.year_of_study or 1,
            "is_verified": v.is_verified,
            "has_voted": v.has_voted,
            "vote_permission": v.vote_permission,
            "verification_id_set": v.verification_id is not None,
            "face_enrolled": v.reference_image_url is not None and v.face_encoding is not None,
            "reference_image_url": v.reference_image_url
        }
        for v in voters
    ]


@router.put("/admin/voters/{voter_id}/permission")
async def update_voter_permission(
    voter_id: str,
    body: VoterPermissionUpdateRequest,
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Grant or revoke a voter's permission to cast a vote."""
    try:
        voter_uuid = uuid.UUID(voter_id)
    except ValueError:
        try:
            import uuid as uuid_lib
            voter_uuid = uuid_lib.UUID(voter_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid voter UUID format")

    query = select(Voter).where(Voter.voter_id == voter_uuid)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise HTTPException(status_code=404, detail="Voter not found")

    voter.vote_permission = body.vote_permission
    await db.commit()

    return {
        "message": f"Voting permission successfully {'granted' if body.vote_permission else 'revoked'} for {voter.full_name}",
        "voter_id": str(voter.voter_id),
        "vote_permission": voter.vote_permission
    }


class BulkPermissionRequest(BaseModel):
    vote_permission: bool
    department: str = "All"  # "All" = all voters, or a specific department name


@router.post("/admin/voters/bulk-permission")
@limiter.limit("10/minute")
async def bulk_update_voter_permission(
    request: Request,
    body: BulkPermissionRequest,
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Bulk grant or revoke voting permission for all voters, optionally filtered by department.
    More efficient than calling the individual endpoint in a loop.
    """
    from sqlalchemy import update as sa_update

    if body.department == "All":
        stmt = (
            sa_update(Voter)
            .values(vote_permission=body.vote_permission)
        )
    else:
        stmt = (
            sa_update(Voter)
            .where(Voter.department == body.department)
            .values(vote_permission=body.vote_permission)
        )

    result = await db.execute(stmt)
    await db.commit()

    action = "granted" if body.vote_permission else "revoked"
    return {
        "message": f"Voting permission {action} for {result.rowcount} voter(s) in '{body.department}'.",
        "affected_count": result.rowcount,
        "vote_permission": body.vote_permission,
        "department": body.department
    }


# ── Set / Update Verification Code (Admin only) ────────────────
class VoterVerificationCodeRequest(BaseModel):
    verification_code: str


@router.put("/admin/voters/{voter_id}/verification-code")
async def set_voter_verification_code(
    voter_id: str,
    body: VoterVerificationCodeRequest,
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Set or update the private verification ID for a voter.
    This ID is given to the voter privately (e.g. printed on their ID card)
    and must be entered before they can cast a vote.
    """
    try:
        voter_uuid = uuid.UUID(voter_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid voter UUID format")

    query = select(Voter).where(Voter.voter_id == voter_uuid)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise HTTPException(status_code=404, detail="Voter not found")

    code = body.verification_code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="Verification ID cannot be empty.")
    
    if not re.match(r"^[A-Z0-9]{8}$", code):
        raise HTTPException(
            status_code=400,
            detail="Verification ID must be exactly 8 uppercase alphanumeric characters."
        )

    from app.security.password_service import hash_password
    voter.verification_id = hash_password(code)
    await db.commit()

    return {
        "message": f"Verification ID set successfully for {voter.full_name}",
        "voter_id": str(voter.voter_id),
        "verification_id_set": True
    }


# ── Verify Verification ID (Voter only) ────────────────
class VerifyIdRequest(BaseModel):
    verification_id: str


@router.post("/verify-id")
@limiter.limit("5/minute")
async def verify_voter_id(
    request: Request,
    body: VerifyIdRequest,
    current_user: dict = Depends(get_voter_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify the voter's 8-character verification ID against the bcrypt hash in the DB."""
    voter_id = current_user.get("user_id")
    if not voter_id:
        logger.warning(f"VERIFY_ID_FAIL: no voter_id in token for {current_user.get('email')}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    query = select(Voter).where(Voter.voter_id == voter_id)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        logger.warning(f"VERIFY_ID_FAIL: voter not found for voter_id={voter_id}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter profile not found")

    # ── Backend lockout check (Redis + DB fallback) ─────────
    redis_locked, redis_remaining = await redis_verify_id_lockout.check_lockout(str(voter_id))
    if redis_locked and redis_remaining is not None:
        logger.warning(
            f"VERIFY_ID_LOCKED: voter={voter.college_email} voter_id={voter_id} "
            f"remaining={redis_remaining}s ip={extract_client_ip(request)}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Too many failed attempts. Verification locked. Try again in {redis_remaining // 60}m {redis_remaining % 60}s."
        )

    # DB fallback: check verify_id_lockout_until when Redis is unavailable
    if not redis_locked:
        db_locked, db_remaining = check_verify_id_db_lockout(voter)
        if db_locked and db_remaining is not None:
            logger.warning(
                f"VERIFY_ID_LOCKED_DB: voter={voter.college_email} voter_id={voter_id} "
                f"remaining={db_remaining}s ip={extract_client_ip(request)}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Too many failed attempts. Verification locked. Try again in {db_remaining // 60}m {db_remaining % 60}s."
            )

    # ── Log incoming request details ─────────────────────────
    ip_addr = extract_client_ip(request)

    election_query = select(Election).order_by(Election.created_at.desc())
    election_result = await db.execute(election_query)
    election = election_result.scalars().first()
    election_id_str = str(election.election_id) if election else "N/A"

    logger.info(
        f"VERIFY_ID_INCOMING "
        f"voter_id={voter_id} "
        f"email={voter.college_email} "
        f"entered_code=(hidden) "
        f"code_length={len(body.verification_id)} "
        f"election_id={election_id_str} "
        f"has_voted={voter.has_voted} "
        f"has_verification_id={voter.verification_id is not None} "
        f"ip={ip_addr}"
    )

    if voter.has_voted:
        logger.warning(f"VERIFY_ID_REJECT: already voted for voter={voter.college_email} voter_id={voter_id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already cast your vote."
        )

    # ── Verification ID Check ────────────────────────────────
    user_agent = request.headers.get("user-agent", "unknown")
    from app.security.password_service import verify_password
    if not voter.verification_id:
        logger.warning(f"VERIFY_ID_REJECT: no verification_id set for voter={voter.college_email} voter_id={voter_id}")
        fail_audit = AuditLog(
            event_type="VERIFY_ID_FAILED",
            actor_id=voter.voter_id,
            description=f"User Agent: {user_agent} | Election ID: {election_id_str} | No verification ID set on account",
            ip_address=ip_addr,
            created_at=datetime.now(timezone.utc)
        )
        db.add(fail_audit)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No verification ID set for your account. Contact the election admin."
        )
    if not verify_password(body.verification_id, voter.verification_id):
        # Log VERIFY_ID_FAILED
        fail_audit = AuditLog(
            event_type="VERIFY_ID_FAILED",
            actor_id=voter.voter_id,
            description=f"User Agent: {user_agent} | Election ID: {election_id_str} | Verification ID mismatch",
            ip_address=ip_addr,
            created_at=datetime.now(timezone.utc)
        )
        db.add(fail_audit)

        # ── Increment failure counter (Redis + DB fallback) ───
        locked, remaining = await redis_verify_id_lockout.increment_and_check(str(voter_id))

        # DB fallback: if Redis is unavailable, track failures in DB
        if not locked and not settings.USE_REDIS:
            voter.failed_verify_id_attempts = (voter.failed_verify_id_attempts or 0) + 1
            if voter.failed_verify_id_attempts >= RedisVerifyIdLockoutStore.MAX_ATTEMPTS:
                set_verify_id_db_lockout(voter)
                locked = True
                remaining = RedisVerifyIdLockoutStore.LOCKOUT_MINUTES * 60

        if locked:
            logger.warning(
                f"VERIFY_ID_LOCKED: voter={voter.college_email} voter_id={voter_id} "
                f"locked_for={remaining}s ip={ip_addr}"
            )
            audit_lockout = AuditLog(
                event_type="VERIFY_ID_LOCKOUT_TRIGGERED",
                actor_id=voter.voter_id,
                description=f"Voter locked out for {RedisVerifyIdLockoutStore.LOCKOUT_MINUTES} min due to {RedisVerifyIdLockoutStore.MAX_ATTEMPTS} consecutive verification ID failures.",
                ip_address=ip_addr,
                created_at=datetime.now(timezone.utc)
            )
            db.add(audit_lockout)
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Too many failed attempts. Verification locked for {RedisVerifyIdLockoutStore.LOCKOUT_MINUTES} minutes."
            )
        logger.warning(
            f"VERIFY_ID_REJECT: code mismatch "
            f"voter={voter.college_email} "
            f"voter_id={voter_id} "
            f"entered_len={len(body.verification_id)} "
            f"ip={ip_addr}"
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verification ID does not match. Please re-enter your verification code."
        )

    # ── Success: clear lockout counter (Redis + DB) ─────────
    await redis_verify_id_lockout.clear(str(voter_id))
    voter.failed_verify_id_attempts = 0
    voter.verify_id_lockout_until = None

    logger.info(f"VERIFY_ID_SUCCESS: voter={voter.college_email} voter_id={voter_id} election_id={election_id_str}")

    success_audit = AuditLog(
        event_type="VERIFY_ID_SUCCESS",
        actor_id=voter.voter_id,
        description=f"User Agent: {user_agent} | Election ID: {election_id_str} | Verification ID verification successful",
        ip_address=ip_addr,
        created_at=datetime.now(timezone.utc)
    )
    db.add(success_audit)

    # Generate anti-replay token
    from app.security.anti_replay_service import AntiReplayService
    anti_replay_token = await AntiReplayService.generate_token(user_id=str(voter.voter_id), db_session=db)

    return {"success": True, "anti_replay_token": anti_replay_token}
