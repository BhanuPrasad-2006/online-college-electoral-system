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
import threading
from datetime import timezone, datetime, timedelta
from app.services.face_service import extract_face_embedding, compare_face_embeddings, deserialize_embedding, serialize_embedding
from app.utils.image_validator import validate_image

from app.db.session import get_db
from app.api.deps import get_current_user, get_admin_user
from app.models.voter import Voter
from app.models.candidate import Candidate
from app.models.election import Election
from app.models.position import Position
from app.models.vote import Vote
from app.enums.election_status import ElectionStatusEnum
from app.services.email_service import send_election_email
from app.services.supabase_storage import SupabaseStorageError, upload_voter_face as supabase_upload_voter_face
from app.utils.logger import logger
from app.core.config import settings
from pydantic import BaseModel
from typing import Optional, List
from app.middleware.rate_limit import limiter
from app.models.audit_log import AuditLog

router = APIRouter()

class BiometricTokenCache:
    def __init__(self):
        # Maps jti -> expiration timestamp (int)
        self.active_tokens = {}
        self.lock = threading.Lock()
        
    def register_token(self, jti: str, exp_ts: int):
        with self.lock:
            self._prune_expired()
            self.active_tokens[jti] = exp_ts
            
    def validate_and_consume(self, jti: str) -> bool:
        with self.lock:
            self._prune_expired()
            if jti in self.active_tokens:
                self.active_tokens.pop(jti)
                return True
            return False
            
    def _prune_expired(self):
        now = int(datetime.now(timezone.utc).timestamp())
        expired = [jti for jti, exp in self.active_tokens.items() if exp < now]
        for jti in expired:
            self.active_tokens.pop(jti, None)

biometric_token_cache = BiometricTokenCache()

class FaceVerifyRequest(BaseModel):
    live_face_image: str
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


@router.post("/verify-face")
@limiter.limit("5/10minute")
async def verify_face(
    request: Request,
    body: FaceVerifyRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    # Fetch voter details
    query = select(Voter).where(Voter.voter_id == voter_id)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()
    if not voter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter profile not found.")

    # Validate voter has not already voted
    if voter.has_voted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You have already cast your vote.")

    # Enforce Lockouts
    now = datetime.now(timezone.utc)
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

    # Fetch and validate active election
    election_query = select(Election).order_by(Election.created_at.desc())
    election_result = await db.execute(election_query)
    election = election_result.scalars().first()
    if not election or election.status != ElectionStatusEnum.VOTING_OPEN.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voting is not currently open.")

    # Validate election verification code token (already passed verify-id)
    from app.security.anti_replay_service import AntiReplayService
    is_valid = await AntiReplayService.validate_and_consume(body.anti_replay_token, voter_id, db)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification session token. Please re-verify your ID.")

    # Decode face image
    try:
        if "," in body.live_face_image:
            header, encoded = body.live_face_image.split(",", 1)
        else:
            encoded = body.live_face_image
        image_data = base64.b64decode(encoded)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid face image format.")

    if len(image_data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Image size exceeds 10MB limit.")

    # Replay Protection: SHA256 of image frame
    from app.services.face_service import replay_cache
    if replay_cache.is_replay_and_add(image_data):
        logger.warning(f"Biometric replay attack attempt detected for voter: {voter.college_email}")
        audit_entry = AuditLog(
            event_type="BIOMETRIC_REPLAY_DETECTED",
            actor_id=voter.voter_id,
            description=f"Voter {voter.full_name} biometric replay check failed (identical image submitted)",
            ip_address=request.client.host if request.client else "127.0.0.1",
            created_at=datetime.now(timezone.utc)
        )
        db.add(audit_entry)
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Biometric verification failed (replay detected).")

    # Perform liveness, normalization & quality checks
    try:
        live_emb = extract_face_embedding(image_data)
    except ValueError as ve:
        voter.failed_face_attempts += 1
        description = f"Biometric verification poor quality/liveness failed: {ve}"
        logger.warning(f"Voter {voter.college_email} quality failed: {ve}")

        audit_entry = AuditLog(
            event_type="BIOMETRIC_POOR_QUALITY",
            actor_id=voter.voter_id,
            description=description,
            ip_address=request.client.host if request.client else "127.0.0.1",
            created_at=datetime.now(timezone.utc)
        )
        db.add(audit_entry)

        if voter.failed_face_attempts >= 3:
            voter.lockout_until = datetime.now(timezone.utc) + timedelta(minutes=15)
            logger.warning(f"Voter {voter.college_email} locked out due to 3 failed face attempts.")
            audit_lockout = AuditLog(
                event_type="BIOMETRIC_LOCKOUT_TRIGGERED",
                actor_id=voter.voter_id,
                description="Voter locked out for 15 minutes due to 3 consecutive biometric verification failures.",
                ip_address=request.client.host if request.client else "127.0.0.1",
                created_at=datetime.now(timezone.utc)
            )
            db.add(audit_lockout)

        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))

    # Match ArcFace template
    if not voter.face_encoding:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No enrolled face template found. Please register your face first.")

    stored_emb = deserialize_embedding(voter.face_encoding)
    if not compare_face_embeddings(live_emb, stored_emb):
        voter.failed_face_attempts += 1
        logger.warning(f"Voter {voter.college_email} biometric comparison mismatch.")

        audit_entry = AuditLog(
            event_type="BIOMETRIC_VERIFY_FAILURE",
            actor_id=voter.voter_id,
            description="Face verification failed (biometric template mismatch)",
            ip_address=request.client.host if request.client else "127.0.0.1",
            created_at=datetime.now(timezone.utc)
        )
        db.add(audit_entry)

        if voter.failed_face_attempts >= 3:
            voter.lockout_until = datetime.now(timezone.utc) + timedelta(minutes=15)
            logger.warning(f"Voter {voter.college_email} locked out due to 3 mismatch failures.")
            audit_lockout = AuditLog(
                event_type="BIOMETRIC_LOCKOUT_TRIGGERED",
                actor_id=voter.voter_id,
                description="Voter locked out for 15 minutes due to 3 consecutive biometric verification failures.",
                ip_address=request.client.host if request.client else "127.0.0.1",
                created_at=datetime.now(timezone.utc)
            )
            db.add(audit_lockout)

        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Face verification failed. Captured face does not match registered student photo.")

    # Success: reset lockout, issue face session token
    voter.failed_face_attempts = 0
    voter.lockout_until = None

    ip_addr = request.client.host if request.client else "127.0.0.1"
    x_forwarded = request.headers.get("x-forwarded-for")
    if x_forwarded:
        ip_addr = x_forwarded.split(",")[0].strip()
    device_fingerprint = request.headers.get("x-device-fingerprint") or "unknown_device"

    ip_hash = hashlib.sha256(ip_addr.encode("utf-8")).hexdigest()
    fp_hash = hashlib.sha256(device_fingerprint.encode("utf-8")).hexdigest()

    jti = str(uuid.uuid4())
    nonce = secrets.token_hex(16)
    expire = datetime.now(timezone.utc) + timedelta(minutes=2)
    exp_ts = int(expire.timestamp())

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
    biometric_token_cache.register_token(jti, exp_ts)

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

    await db.commit()

    return {
        "success": True,
        "face_session_token": face_session_token,
        "expires_in_seconds": 120
    }


@router.post("/cast")
@limiter.limit("5/minute")
async def cast_vote(
    request: Request,
    body: VoteCastRequest,
    current_user: dict = Depends(get_current_user),
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

    # Fetch the active election
    election_query = select(Election).order_by(Election.created_at.desc())
    election_result = await db.execute(election_query)
    election = election_result.scalars().first()

    # Call vote validator
    from app.validators.vote_validator import validate_vote_submission
    is_valid, err_msg = await validate_vote_submission(db, election, voter)
    if not is_valid:
        status_code = status.HTTP_400_BAD_REQUEST
        if "permission" in err_msg:
            status_code = status.HTTP_403_FORBIDDEN
        elif "not found" in err_msg:
            status_code = status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=err_msg)


    # ── Verification ID Check ────────────────────────────────
    from app.security.password_service import verify_password
    if not voter.verification_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No verification ID set for your account. Contact the election admin."
        )
    if not verify_password(body.verification_id, voter.verification_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verification ID does not match. Please re-enter your verification code."
        )

    # ── Face Verification ────────────────────────────────────
    if settings.ENABLE_FACE_VERIFICATION and voter.face_encoding:
        if not body.face_session_token:
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
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Biometric verification token has expired. Please verify face again."
            )
        except jwt.PyJWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid biometric session token: {e}"
            )
            
        if payload.get("purpose") != "face_cast":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token purpose.")
            
        if payload.get("sub") != str(voter_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Biometric token voter ID mismatch.")
            
        ip_addr = request.client.host if request.client else "127.0.0.1"
        x_forwarded = request.headers.get("x-forwarded-for")
        if x_forwarded:
            ip_addr = x_forwarded.split(",")[0].strip()
        device_fingerprint = request.headers.get("x-device-fingerprint") or "unknown_device"
        
        expected_ip_hash = hashlib.sha256(ip_addr.encode("utf-8")).hexdigest()
        expected_fp_hash = hashlib.sha256(device_fingerprint.encode("utf-8")).hexdigest()
        
        if payload.get("ip") != expected_ip_hash:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Biometric session IP mismatch. Security validation failed.")
        if payload.get("fp") != expected_fp_hash:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Biometric session device mismatch. Security validation failed.")
            
        jti = payload.get("jti")
        if not jti or not biometric_token_cache.validate_and_consume(jti):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Biometric token has already been consumed or is invalid.")
            
        audit_consume = AuditLog(
            event_type="BIOMETRIC_TOKEN_CONSUMED",
            actor_id=voter.voter_id,
            description=f"Consumed face_session_token with JTI: {jti}",
            ip_address=ip_addr,
            created_at=datetime.now(timezone.utc)
        )
        db.add(audit_consume)
    elif voter.face_encoding:
        # Fallback to old face verification inline if face verification flag is disabled but image provided
        if not body.live_face_image:
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
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid face image format."
            )
            
        try:
            live_emb = extract_face_embedding(image_data)
            stored_emb = deserialize_embedding(voter.face_encoding)
            
            if not compare_face_embeddings(live_emb, stored_emb):
                raise ValueError(
                    "Face verification failed. Captured face does not match registered student photo."
                )
        except ValueError as ve:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(ve)
            )
        except RuntimeError as re:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(re)
            )
        except ImportError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Face verification is temporarily unavailable. The face recognition module is not fully installed on the server."
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Face verification failed unexpectedly: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Face verification encountered an unexpected error. Please try again or contact the election admin."
            )

    # Keep using the same validated current election so casting follows
    # the same date/phase logic shown throughout the frontend.

    candidate = None
    position_id = None
    
    if body.candidate_id:
        try:
            cand_uuid = uuid.UUID(body.candidate_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid candidate ID format")

        candidate_query = select(Candidate).where(Candidate.candidate_id == cand_uuid)
        cand_result = await db.execute(candidate_query)
        candidate = cand_result.scalar_one_or_none()
        if not candidate:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Selected candidate not found")

        # Verify candidate belongs to the active election
        if str(candidate.election_id) != str(election.election_id):
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
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="President position not found in this election."
            )
        position_id = position_record.position_id

    # ── Anti-Replay Token Verification (Deferred until all other checks succeed) ──
    if not body.anti_replay_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Anti-replay token is missing."
        )
    from app.security.anti_replay_service import AntiReplayService
    is_token_valid = await AntiReplayService.validate_and_consume(body.anti_replay_token, voter_id, db)
    if not is_token_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired anti-replay token. Please verify your ID again."
        )

    # Generate cryptographic anonymous token hash
    random_token = str(uuid.uuid4())
    voter_token_hash = hashlib.sha256(random_token.encode("utf-8")).hexdigest()

    from sqlalchemy import func, text
    from app.services.ledger_service import calculate_vote_hash, append_to_secure_vault

    # ═══════════════════════════════════════════════════════════
    # CRITICAL SECTION — row lock + atomic sequence
    # ═══════════════════════════════════════════════════════════

    # 1. Lock the voter row to prevent double-voting under concurrency
    lock_query = select(Voter).where(Voter.voter_id == voter_id).with_for_update()
    lock_result = await db.execute(lock_query)
    locked_voter = lock_result.scalar_one_or_none()

    if not locked_voter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voter profile not found"
        )

    # 2. Re-check has_voted under the lock (TOCTOU prevention)
    if locked_voter.has_voted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already cast your vote."
        )

    # 3. Get next ledger sequence atomically
    #    PostgreSQL: uses nextval() which is concurrency-safe
    #    SQLite: falls back to MAX(ledger_sequence) + 1 (tests only)
    try:
        seq_result = await db.execute(text("SELECT nextval('votes_ledger_sequence_seq')"))
        next_seq = seq_result.scalar()
    except Exception:
        # Fallback for SQLite/Test environments
        seq_query = select(func.max(Vote.ledger_sequence))
        seq_result = await db.execute(seq_query)
        max_seq = seq_result.scalar() or 0
        next_seq = max_seq + 1

    # 4. Compute previous hash from the preceding committed vote
    previous_hash = None
    if next_seq > 1:
        prev_query = select(Vote.current_hash).where(Vote.ledger_sequence == next_seq - 1)
        prev_result = await db.execute(prev_query)
        previous_hash = prev_result.scalar()

    # 5. Generate timestamp string
    now_utc = datetime.now(timezone.utc)
    timestamp_str = now_utc.replace(tzinfo=None).isoformat()

    # 6. Generate current hash
    current_hash = await calculate_vote_hash(
        candidate_id=str(candidate.candidate_id) if candidate else None,
        timestamp_utc=timestamp_str,
        election_id=str(election.election_id),
        previous_hash=previous_hash,
        ledger_sequence=next_seq
    )

    # 7. Create anonymous vote
    new_vote = Vote(
        vote_id=str(uuid.uuid4()),
        voter_token_hash=voter_token_hash,
        candidate_id=str(candidate.candidate_id) if candidate else None,
        election_id=str(election.election_id),
        position_id=str(position_id),
        previous_hash=previous_hash,
        current_hash=current_hash,
        ledger_sequence=next_seq,
        timestamp_utc=now_utc
    )
    
    db.add(new_vote)

    # 8. Mark voter as having voted (under the same lock)
    locked_voter.has_voted = True
    await db.commit()

    # Append to secure vault
    vote_data = {
        "ledger_sequence": next_seq,
        "election_id": str(election.election_id),
        "position_id": str(position_id),
        "candidate_id": str(candidate.candidate_id) if candidate else None,
        "timestamp_utc": timestamp_str
    }
    await append_to_secure_vault(vote_data, current_hash)

    # Trigger Email confirmation (SMS alerts removed per user preference)
    if voter.college_email:
        try:
            voted_at_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            email_body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 24px;">
                <div style="background: #10b981; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h2 style="color: white; margin: 0;">🗳️ Vote Registered Successfully</h2>
                </div>
                <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
                    <p style="color: #374151; font-size: 16px;">Hi <strong>{voter.full_name}</strong>,</p>
                    <p style="color: #374151; font-size: 15px; line-height: 1.5;">
                        Your vote in <strong>{election.title}</strong> has been successfully cast and registered.
                    </p>
                    <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 12px; margin: 20px 0; border-radius: 0 4px 4px 0;">
                        <p style="color: #065f46; margin: 0; font-size: 14px; font-weight: bold;">
                            Status: Vote Registered ✓
                        </p>
                        <p style="color: #047857; margin: 4px 0 0 0; font-size: 12px;">
                            Cast on: {voted_at_str} UTC
                        </p>
                    </div>
                    <p style="color: #6b7280; font-size: 13px; line-height: 1.4;">
                        🔒 To protect your privacy, there is no link in the database between your student identity and the candidate you voted for. Your vote is anonymous.
                    </p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                    <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                        Thank you for participating in the electoral process.
                    </p>
                </div>
            </body>
            </html>
            """
            
            asyncio.create_task(
                send_election_email(
                    to_email=voter.college_email,
                    recipient_name=voter.full_name,
                    subject=f"Vote Successfully Registered - {election.title}",
                    html_body=email_body
                )
            )
        except Exception as e:
            logger.error(f"Failed to send vote confirmation email: {e}")

    # ── Fraud and Anomaly Detection ──────────────────────────
    ip_addr = request.client.host if request.client else "127.0.0.1"
    x_forwarded = request.headers.get("x-forwarded-for")
    if x_forwarded:
        ip_addr = x_forwarded.split(",")[0].strip()

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
        "has_voted": True
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
    
    # If admin requested re-upload, allow upload regardless of phase (except after results)
    if voter.photo_reupload_requested:
        if election:
            election_status = election.status
            if hasattr(election_status, 'value'):
                election_status = election_status.value
            if election_status == ElectionStatusEnum.RESULTS_PUBLISHED.value:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot upload photos after results have been published."
                )
    else:
        if election:
            election_status = election.status
            if hasattr(election_status, 'value'):
                election_status = election_status.value
            if election_status in [
                ElectionStatusEnum.VOTING_OPEN.value,
                ElectionStatusEnum.CLOSED.value,
                ElectionStatusEnum.RESULTS_PUBLISHED.value,
            ]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Photo can only be updated before the voting phase begins. Contact the election admin if you need to update your photo."
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
        embedding = extract_face_embedding(image_data)
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

    # Upload to Supabase Storage (with local fallback) — save as PENDING only
    # The admin must approve the new photo before it becomes active
    supabase_enabled = bool(settings.supabase_project_url and settings.SUPABASE_SERVICE_ROLE_KEY)
    if supabase_enabled:
        try:
            uploaded = await supabase_upload_voter_face(
                voter_id=voter_id,
                filename=f"pending_{file.filename or 'face.jpg'}",
                content_type=file.content_type,
                data=image_data,
            )
            voter.pending_image_url = uploaded.public_url
            voter.pending_face_encoding = serialize_embedding(embedding)
        except SupabaseStorageError as exc:
            logger.error(f"Supabase voter face upload failed: {exc}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to upload photo to storage. Please try again.",
            )
        except Exception as e:
            logger.error(f"Unexpected error during Supabase face upload: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An unexpected error occurred while saving your photo. Please try again.",
            )
    else:
        # Local fallback for development
        file_ext = os.path.splitext(file.filename)[1] or ".jpg"
        safe_filename = f"pending_voter_{voter_id}{file_ext}"
        file_path = os.path.join("uploads/faces", safe_filename)
        os.makedirs("uploads/faces", exist_ok=True)
        try:
            with open(file_path, "wb") as f:
                f.write(image_data)
            voter.pending_image_url = f"/{file_path.replace(os.sep, '/')}"
            voter.pending_face_encoding = serialize_embedding(embedding)
        except PermissionError:
            logger.error(f"Permission denied writing face image to {file_path}")
            raise HTTPException(status_code=500, detail="Server configuration error: cannot write uploads. Contact the election admin.")
        except OSError as e:
            logger.error(f"OS error saving face image: {e}")
            raise HTTPException(status_code=500, detail="Failed to save image file due to a server error. Please try again.")
        except Exception as e:
            logger.error(f"Failed to save voter face image: {e}")
            raise HTTPException(status_code=500, detail="Failed to save image file.")

    # Increment re-upload count and clear the admin re-upload request flag
    voter.photo_reupload_count += 1
    voter.photo_reupload_requested = False

    # Extract real IP from request (not spoofable by client)
    ip_addr = request.client.host if request.client else "127.0.0.1"
    x_forwarded = request.headers.get("x-forwarded-for")
    if x_forwarded:
        ip_addr = x_forwarded.split(",")[0].strip()

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
            "face_enrolled": v.reference_image_url is not None and v.face_encoding is not None
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
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify the voter's 8-character verification ID against the bcrypt hash in the DB."""
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    query = select(Voter).where(Voter.voter_id == voter_id)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter profile not found")

    if voter.has_voted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already cast your vote."
        )

    # ── Verification ID Check ────────────────────────────────
    from app.security.password_service import verify_password
    if not voter.verification_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No verification ID set for your account. Contact the election admin."
        )
    if not verify_password(body.verification_id, voter.verification_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verification ID does not match. Please re-enter your verification code."
        )

    # Generate anti-replay token
    from app.security.anti_replay_service import AntiReplayService
    anti_replay_token = await AntiReplayService.generate_token(user_id=str(voter.voter_id), db_session=db)

    return {"success": True, "anti_replay_token": anti_replay_token}
