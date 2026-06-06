"""
Unit and integration tests for biometric verification and face session tokens.
"""

import uuid
import pytest
import pytest_asyncio
import jwt
import base64
import hashlib
from unittest.mock import patch, MagicMock, mock_open, AsyncMock
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime, timezone, timedelta

# SQLite compilers for Postgres-specific types
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import INET, UUID as PostgresUUID

@compiles(INET, "sqlite")
def compile_inet_sqlite(element, compiler, **kw):
    return "VARCHAR(45)"

@compiles(PostgresUUID, "sqlite")
def compile_uuid_sqlite(element, compiler, **kw):
    return "VARCHAR(36)"

# Set up test database engine
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

import app.db.session as db_module  # noqa: F401

test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestSessionLocal = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)

async def override_get_db():
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

# App & Model imports
from app.main import app
from app.db.session import get_db
from app.db.base import Base as AppBase
from app.models.voter import Voter
from app.models.election import Election
from app.models.position import Position
from app.models.election_phase import ElectionPhase
from app.models.vote import Vote
from app.enums.election_status import ElectionStatusEnum
from app.security.password_service import hash_password
from app.api.deps import get_current_user, get_voting_session
from app.middleware.rate_limit import limiter
from app.core.config import settings

limiter.enabled = False

VOTER_UUID = uuid.uuid4()
VOTER_ID_STR = str(VOTER_UUID)
ELECTION_UUID = uuid.uuid4()
ELECTION_ID_STR = str(ELECTION_UUID)
POSITION_UUID = uuid.uuid4()

_current_auth: dict = {}

async def mock_get_current_user():
    return _current_auth

@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_db():
    app.dependency_overrides[get_current_user] = mock_get_current_user
    app.dependency_overrides[get_voting_session] = mock_get_current_user
    app.dependency_overrides[get_db] = override_get_db
    async with test_engine.begin() as conn:
        await conn.run_sync(AppBase.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(AppBase.metadata.drop_all)
    app.dependency_overrides.clear()

@pytest_asyncio.fixture
async def db_session():
    async with TestSessionLocal() as session:
        yield session

@pytest_asyncio.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

@pytest_asyncio.fixture
async def seeded_voter(db_session: AsyncSession):
    now = datetime.now(timezone.utc)

    election = Election(
        election_id=ELECTION_UUID,
        title="Biometric Test Election",
        description="Testing biometrics",
        status=ElectionStatusEnum.VOTING_OPEN.value,
        voting_start=now - timedelta(hours=1),
        voting_end=now + timedelta(hours=1),
    )
    db_session.add(election)

    position = Position(
        position_id=POSITION_UUID,
        election_id=election.election_id,
        title="President",
    )
    db_session.add(position)

    # Encode a dummy face embedding: unit vector along axis 0
    from app.services.face_service import serialize_embedding
    dummy_emb = serialize_embedding([1.0] + [0.0] * 511)

    voter = Voter(
        voter_id=VOTER_UUID,
        college_email="biovoter@test.edu",
        password_hash=hash_password("VoterPass@123"),
        full_name="Bio Voter",
        student_id="STUDENT02",
        department="CSE",
        year_of_study=3,
        is_verified=True,
        vote_permission=True,
        verification_id=hash_password("ABCD1234"),
        has_voted=False,
        face_encoding=dummy_emb,
        embedding_model_version="arcface_v1",
        failed_face_attempts=0,
    )
    db_session.add(voter)

    phase = ElectionPhase(
        election_id=election.election_id,
        phase_name="Voting",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
        is_active=True,
    )
    db_session.add(phase)

    await db_session.commit()
    return {"voter_id": VOTER_ID_STR, "election_id": ELECTION_ID_STR}

async def _no_auth():
    from fastapi import HTTPException, status
    async def _raise_401():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    app.dependency_overrides[get_current_user] = _raise_401

async def _valid_voter():
    _current_auth.clear()
    _current_auth.update({
        "user_id": VOTER_UUID,
        "email": "biovoter@test.edu",
        "role": "voter",
    })
    app.dependency_overrides[get_current_user] = mock_get_current_user

async def _restore_voter():
    app.dependency_overrides[get_current_user] = mock_get_current_user

@pytest.mark.asyncio
class TestBiometricVerify:

    # -- verify-face auth check --
    async def test_verify_face_no_auth_token_returns_401(self, client: AsyncClient, seeded_voter: dict):
        await _no_auth()
        try:
            resp = await client.post(
                "/api/v1/vote/verify-face",
                json={"live_face_image": "dummy", "anti_replay_token": "token"},
            )
        finally:
            await _restore_voter()
        assert resp.status_code == 401

    # -- verify-face size limits --
    async def test_verify_face_exceeds_size_limit_returns_413(self, client: AsyncClient, seeded_voter: dict):
        await _valid_voter()
        # Create a payload larger than 10MB (base64 decodes to ~11.25MB)
        large_base64 = "a" * (15 * 1024 * 1024)
        resp = await client.post(
            "/api/v1/vote/verify-face",
            json={"live_face_image": large_base64, "anti_replay_token": "token"},
        )
        assert resp.status_code == 413
        assert "exceeds" in resp.text.lower() or "too large" in resp.text.lower()

    # -- verify-face lockout --
    async def test_verify_face_fails_and_locks_out_after_3_attempts(
        self, client: AsyncClient, seeded_voter: dict, db_session: AsyncSession
    ):
        await _valid_voter()
        
        # Mock extract_face_embedding to raise ValueError (bad quality/no face)
        with patch("app.routes.vote.extract_face_embedding") as mock_extract, \
             patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True), \
             patch("app.services.face_service.replay_cache.is_replay_and_add", return_value=False):
            mock_extract.side_effect = ValueError("No face detected in the image.")
            
            # Send 1st attempt
            resp = await client.post(
                "/api/v1/vote/verify-face",
                json={"live_face_image": "data:image/jpeg;base64,dGVzdA==", "anti_replay_token": "token1"},
            )
            assert resp.status_code == 400
            assert "no face" in resp.json()["detail"].lower()
            
            # Send 2nd attempt
            resp = await client.post(
                "/api/v1/vote/verify-face",
                json={"live_face_image": "data:image/jpeg;base64,dGVzdA==", "anti_replay_token": "token2"},
            )
            assert resp.status_code == 400
            
            # Send 3rd attempt (triggers lockout)
            resp = await client.post(
                "/api/v1/vote/verify-face",
                json={"live_face_image": "data:image/jpeg;base64,dGVzdA==", "anti_replay_token": "token3"},
            )
            assert resp.status_code == 400
            
            # Verify lockout is active on 4th attempt
            resp = await client.post(
                "/api/v1/vote/verify-face",
                json={"live_face_image": "data:image/jpeg;base64,dGVzdA==", "anti_replay_token": "token4"},
            )
            assert resp.status_code == 403
            assert "locked" in resp.json()["detail"].lower()

    # -- verify-face success & token issuance --
    async def test_verify_face_success_issues_token(
        self, client: AsyncClient, seeded_voter: dict, db_session: AsyncSession
    ):
        await _valid_voter()
        
        with patch("app.routes.vote.extract_face_embedding", return_value=[1.0] + [0.0] * 511), \
             patch("app.routes.vote.compare_face_embeddings", return_value=True), \
             patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True), \
             patch("app.services.face_service.replay_cache.is_replay_and_add", return_value=False):
            
            resp = await client.post(
                "/api/v1/vote/verify-face",
                json={"live_face_image": "data:image/jpeg;base64,dGVzdA==", "anti_replay_token": "token1"},
                headers={"x-device-fingerprint": "test_device"}
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["success"] is True
            assert "face_session_token" in data
            assert "anti_replay_token" in data
            
            # Decode the JWT token to verify claims
            token = data["face_session_token"]
            payload = jwt.decode(token, settings.JWT_SECRET_KEY, audience="vote_system", algorithms=[settings.JWT_ALGORITHM])
            assert payload["sub"] == VOTER_ID_STR
            assert payload["purpose"] == "face_cast"
            assert "jti" in payload
            assert "ip" in payload
            assert "fp" in payload

    # -- cast-vote biometric validation --
    async def test_cast_vote_requires_biometric_token_when_enabled(
        self, client: AsyncClient, seeded_voter: dict
    ):
        await _valid_voter()
        # Toggle face verification flag to True
        settings.ENABLE_FACE_VERIFICATION = True
        
        # Call /cast without face_session_token -> 400
        resp = await client.post(
            "/api/v1/vote/cast",
            json={"candidate_id": None, "verification_id": "ABCD1234", "anti_replay_token": "replay1"},
        )
        assert resp.status_code == 400
        assert "biometric face token is required" in resp.json()["detail"].lower()

    # -- cast-vote invalid signature / expired token --
    async def test_cast_vote_rejects_expired_biometric_token(
        self, client: AsyncClient, seeded_voter: dict
    ):
        await _valid_voter()
        settings.ENABLE_FACE_VERIFICATION = True

        # Generate expired JWT token
        expire = datetime.now(timezone.utc) - timedelta(minutes=5)
        payload = {
            "sub": VOTER_ID_STR,
            "aud": "vote_system",
            "purpose": "face_cast",
            "jti": "some-jti",
            "nonce": "some-nonce",
            "ip": "some-ip",
            "fp": "some-fp",
            "exp": expire,
            "iat": datetime.now(timezone.utc) - timedelta(minutes=6)
        }
        expired_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        
        resp = await client.post(
            "/api/v1/vote/cast",
            json={
                "candidate_id": None, 
                "verification_id": "ABCD1234", 
                "anti_replay_token": "replay1",
                "face_session_token": expired_token
            },
        )
        assert resp.status_code == 401
        assert "expired" in resp.json()["detail"].lower()

    # -- cast-vote mismatched IP/fingerprint --
    async def test_cast_vote_rejects_mismatched_device_fingerprint(
        self, client: AsyncClient, seeded_voter: dict
    ):
        await _valid_voter()
        settings.ENABLE_FACE_VERIFICATION = True

        # Generate JWT token with specific IP/FP
        ip_hash = hashlib.sha256("127.0.0.1".encode("utf-8")).hexdigest()
        fp_hash = hashlib.sha256("original_device".encode("utf-8")).hexdigest()
        
        expire = datetime.now(timezone.utc) + timedelta(minutes=2)
        payload = {
            "sub": VOTER_ID_STR,
            "aud": "vote_system",
            "purpose": "face_cast",
            "jti": "jti-1",
            "nonce": "nonce-1",
            "ip": ip_hash,
            "fp": fp_hash,
            "exp": expire,
            "iat": datetime.now(timezone.utc)
        }
        token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        
        # Try to cast with a different device fingerprint header -> 403
        resp = await client.post(
            "/api/v1/vote/cast",
            json={
                "candidate_id": None, 
                "verification_id": "ABCD1234", 
                "anti_replay_token": "replay1",
                "face_session_token": token
            },
            headers={"x-device-fingerprint": "different_device"}
        )
        assert resp.status_code == 403
        assert "security validation failed" in resp.json()["detail"].lower()

    # -- cast-vote token reuse protection --
    async def test_cast_vote_token_reuse_protection(
        self, client: AsyncClient, seeded_voter: dict, db_session: AsyncSession
    ):
        await _valid_voter()
        settings.ENABLE_FACE_VERIFICATION = True

        # Create token
        ip_hash = hashlib.sha256("127.0.0.1".encode("utf-8")).hexdigest()
        fp_hash = hashlib.sha256("test_device".encode("utf-8")).hexdigest()
        
        jti = "unique-jti-reuse-test"
        expire = datetime.now(timezone.utc) + timedelta(minutes=2)
        payload = {
            "sub": VOTER_ID_STR,
            "aud": "vote_system",
            "purpose": "face_cast",
            "jti": jti,
            "nonce": "nonce-1",
            "ip": ip_hash,
            "fp": fp_hash,
            "exp": expire,
            "iat": datetime.now(timezone.utc)
        }
        token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        
        # Register in cache
        from app.services.face_service import redis_biometric_token_cache
        await redis_biometric_token_cache.register_token(jti, str(VOTER_ID_STR))
        
        # Mocks for external dependencies inside cast
        with patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True), \
             patch("app.services.ledger_service.append_to_secure_vault", return_value="some-tx-hash"):
             
            # Cast vote first time -> success/200
            resp = await client.post(
                "/api/v1/vote/cast",
                json={
                    "candidate_id": None, 
                    "verification_id": "ABCD1234", 
                    "anti_replay_token": "replay1",
                    "face_session_token": token
                },
                headers={"x-device-fingerprint": "test_device"}
            )
            assert resp.status_code == 200
            assert resp.json()["has_voted"] is True
            
            # Reset voter's voted status in SQLite so we trigger token check and not duplicate vote check
            voter_result = await db_session.execute(select(Voter).where(Voter.voter_id == VOTER_UUID))
            voter = voter_result.scalar_one()
            voter.has_voted = False
            await db_session.commit()
            
            # Cast vote second time with SAME token -> 401 (reused)
            resp = await client.post(
                "/api/v1/vote/cast",
                json={
                    "candidate_id": None, 
                    "verification_id": "ABCD1234", 
                    "anti_replay_token": "replay2",
                    "face_session_token": token
                },
                headers={"x-device-fingerprint": "test_device"}
            )
            assert resp.status_code == 401
            assert "already been consumed" in resp.json()["detail"].lower()

    async def test_cast_vote_commit_failure_does_not_consume_biometric_token(
        self, client: AsyncClient, seeded_voter: dict, db_session: AsyncSession
    ):
        await _valid_voter()
        settings.ENABLE_FACE_VERIFICATION = True

        ip_hash = hashlib.sha256("127.0.0.1".encode("utf-8")).hexdigest()
        fp_hash = hashlib.sha256("test_device".encode("utf-8")).hexdigest()

        jti = "commit-failure-jti"
        expire = datetime.now(timezone.utc) + timedelta(minutes=2)
        payload = {
            "sub": VOTER_ID_STR,
            "aud": "vote_system",
            "purpose": "face_cast",
            "jti": jti,
            "nonce": "nonce-commit-failure",
            "ip": ip_hash,
            "fp": fp_hash,
            "exp": expire,
            "iat": datetime.now(timezone.utc)
        }
        token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

        from app.services.face_service import redis_biometric_token_cache
        await redis_biometric_token_cache.register_token(jti, VOTER_ID_STR)

        with patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True), \
             patch.object(AsyncSession, "commit", new=AsyncMock(side_effect=RuntimeError("forced vote commit failure"))):
            resp = await client.post(
                "/api/v1/vote/cast",
                json={
                    "candidate_id": None,
                    "verification_id": "ABCD1234",
                    "anti_replay_token": "replay1",
                    "face_session_token": token
                },
                headers={"x-device-fingerprint": "test_device"}
            )

        assert resp.status_code == 500

        assert await redis_biometric_token_cache.validate(jti, VOTER_ID_STR) is True

        voter_result = await db_session.execute(select(Voter).where(Voter.voter_id == VOTER_UUID))
        voter = voter_result.scalar_one()
        assert voter.has_voted is False

        vote_result = await db_session.execute(select(Vote))
        assert vote_result.scalars().all() == []

    # -- verify-face-passive success & token issuance --
    async def test_verify_face_passive_success(
        self, client: AsyncClient, seeded_voter: dict, db_session: AsyncSession
    ):
        await _valid_voter()
        
        success_emb = [0.925, 0.3799671] + [0.0] * 510
        with patch("app.routes.vote.normalize_image", return_value=MagicMock()), \
             patch("app.services.face_service.assess_frame_quality") as mock_assess, \
             patch("app.services.face_service.enhance_frame", side_effect=lambda img, q: img), \
             patch("cv2.imencode", return_value=(True, MagicMock(tobytes=lambda: b"fake_bytes"))), \
             patch("app.routes.vote.extract_face_embedding", return_value=success_emb), \
             patch("app.routes.vote.check_passive_liveness", return_value=(True, "passed")), \
             patch("app.services.face_service.replay_cache.is_replay_and_add", return_value=False), \
             patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True):
            
            mock_assess.return_value = {
                "blur": 85.0,
                "brightness": 120.0,
                "contrast": 50.0,
                "face_size": 20.0,
                "centeredness": 90.0,
                "confidence": 95.0,
                "classification": "EXCELLENT",
                "has_face": True,
                "box": [10, 10, 100, 100],
                "face_count": 1
            }
            resp = await client.post(
                "/api/v1/vote/verify-face-passive",
                json={
                    "frames": ["data:image/jpeg;base64,dGVzdA=="] * 5,
                    "anti_replay_token": "token1"
                },
                headers={"x-device-fingerprint": "test_device"}
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["success"] is True
            assert "face_session_token" in data
            assert "anti_replay_token" in data
            assert data["match_score"] == 92.5

    # -- verify-face-passive mismatch returns match_score in detail --
    async def test_verify_face_passive_mismatch(
        self, client: AsyncClient, seeded_voter: dict, db_session: AsyncSession
    ):
        await _valid_voter()
        
        mismatch_emb = [0.40, 0.9165151] + [0.0] * 510
        with patch("app.routes.vote.normalize_image", return_value=MagicMock()), \
             patch("app.services.face_service.assess_frame_quality") as mock_assess, \
             patch("app.services.face_service.enhance_frame", side_effect=lambda img, q: img), \
             patch("cv2.imencode", return_value=(True, MagicMock(tobytes=lambda: b"fake_bytes"))), \
             patch("app.routes.vote.extract_face_embedding", return_value=mismatch_emb), \
             patch("app.routes.vote.check_passive_liveness", return_value=(True, "passed")), \
             patch("app.services.face_service.replay_cache.is_replay_and_add", return_value=False), \
             patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True):
            
            mock_assess.return_value = {
                "blur": 85.0,
                "brightness": 120.0,
                "contrast": 50.0,
                "face_size": 20.0,
                "centeredness": 90.0,
                "confidence": 95.0,
                "classification": "EXCELLENT",
                "has_face": True,
                "box": [10, 10, 100, 100],
                "face_count": 1
            }
            resp = await client.post(
                "/api/v1/vote/verify-face-passive",
                json={
                    "frames": ["data:image/jpeg;base64,dGVzdA=="] * 5,
                    "anti_replay_token": "token1"
                },
                headers={"x-device-fingerprint": "test_device"}
            )
            assert resp.status_code == 400
            data = resp.json()
            assert "detail" in data
            assert isinstance(data["detail"], dict)
            assert "face match below threshold" in data["detail"]["message"].lower()
            assert "40.0%" in data["detail"]["message"]
            assert data["detail"]["match_score"] == 40.0


@pytest.mark.asyncio
class TestPhotoUpload:
    """
    Tests for the photo upload endpoint phase gates.
    Verifies upload is allowed during VOTING_OPEN and RESULTS_PUBLISHED,
    but blocked during CLOSED (for normal voters without re-upload request).
    """

    async def test_upload_photo_during_voting_open_allowed(
        self, client: AsyncClient, seeded_voter: dict, db_session: AsyncSession
    ):
        """Upload should succeed when election status is VOTING_OPEN."""
        await _valid_voter()

        with patch("app.routes.vote.extract_face_embedding", return_value=[0.1] * 512), \
             patch("app.routes.vote.validate_image") as mock_validate, \
             patch("app.routes.vote.save_voter_face_image") as mock_save, \
             patch("os.makedirs"), \
             patch("builtins.open", mock_open()):
            mock_validate.return_value = MagicMock(passed=True)
            mock_save.return_value = MagicMock(reference_url="/uploads/faces/TEST/pending_test.jpg")

            resp = await client.post(
                "/api/v1/vote/upload-photo",
                files={"file": ("test.jpg", b"fake_image_data", "image/jpeg")},
            )
            assert resp.status_code == 200, f"VOTING_OPEN upload failed: {resp.text}"
            data = resp.json()
            assert data["success"] is True
            assert "pending_image_url" in data

    async def test_upload_photo_during_results_published_allowed(
        self, client: AsyncClient, seeded_voter: dict, db_session: AsyncSession
    ):
        """Upload should succeed when election status is RESULTS_PUBLISHED.
        This verifies the fix that removed RESULTS_PUBLISHED from the phase gate.
        """
        await _valid_voter()

        # Change election status to RESULTS_PUBLISHED
        result = await db_session.execute(
            select(Election).where(Election.election_id == ELECTION_UUID)
        )
        election = result.scalar_one()
        election.status = ElectionStatusEnum.RESULTS_PUBLISHED.value
        await db_session.commit()

        with patch("app.routes.vote.extract_face_embedding", return_value=[0.1] * 512), \
             patch("app.routes.vote.validate_image") as mock_validate, \
             patch("app.routes.vote.save_voter_face_image") as mock_save, \
             patch("os.makedirs"), \
             patch("builtins.open", mock_open()):
            mock_validate.return_value = MagicMock(passed=True)
            mock_save.return_value = MagicMock(reference_url="/uploads/faces/TEST/pending_test.jpg")

            resp = await client.post(
                "/api/v1/vote/upload-photo",
                files={"file": ("test.jpg", b"fake_image_data", "image/jpeg")},
            )
            assert resp.status_code == 200, f"RESULTS_PUBLISHED upload blocked: {resp.text}"
            data = resp.json()
            assert data["success"] is True

    async def test_upload_photo_during_closed_blocked(
        self, client: AsyncClient, seeded_voter: dict, db_session: AsyncSession
    ):
        """Upload should be blocked when election status is CLOSED (normal voter)."""
        await _valid_voter()

        # Change election status to CLOSED
        result = await db_session.execute(
            select(Election).where(Election.election_id == ELECTION_UUID)
        )
        election = result.scalar_one()
        election.status = ElectionStatusEnum.CLOSED.value
        await db_session.commit()

        resp = await client.post(
            "/api/v1/vote/upload-photo",
            files={"file": ("test.jpg", b"fake_image_data", "image/jpeg")},
        )
        assert resp.status_code == 403, f"CLOSED upload not blocked: {resp.text}"
        assert "before voting ends" in resp.json()["detail"].lower()

    async def test_upload_photo_unauthenticated_returns_401(
        self, client: AsyncClient, seeded_voter: dict
    ):
        """Unauthenticated requests should be rejected."""
        await _no_auth()
        try:
            resp = await client.post(
                "/api/v1/vote/upload-photo",
                files={"file": ("test.jpg", b"fake_image_data", "image/jpeg")},
            )
        finally:
            await _restore_voter()
        assert resp.status_code == 401

    async def test_upload_photo_during_closed_with_reupload_request_allowed(
        self, client: AsyncClient, seeded_voter: dict, db_session: AsyncSession
    ):
        """Upload should succeed during CLOSED if admin requested re-upload."""
        await _valid_voter()

        # Set voter's photo_reupload_requested flag and change election to CLOSED
        result = await db_session.execute(
            select(Voter).where(Voter.voter_id == VOTER_UUID)
        )
        voter = result.scalar_one()
        voter.photo_reupload_requested = True
        voter.photo_reupload_count = 0

        elec_result = await db_session.execute(
            select(Election).where(Election.election_id == ELECTION_UUID)
        )
        election = elec_result.scalar_one()
        election.status = ElectionStatusEnum.CLOSED.value
        await db_session.commit()

        with patch("app.routes.vote.extract_face_embedding", return_value=[0.1] * 512), \
             patch("app.routes.vote.validate_image") as mock_validate, \
             patch("app.routes.vote.save_voter_face_image") as mock_save, \
             patch("os.makedirs"), \
             patch("builtins.open", mock_open()):
            mock_validate.return_value = MagicMock(passed=True)
            mock_save.return_value = MagicMock(reference_url="/uploads/faces/TEST/pending_test.jpg")

            resp = await client.post(
                "/api/v1/vote/upload-photo",
                files={"file": ("test.jpg", b"fake_image_data", "image/jpeg")},
            )
            assert resp.status_code == 200, f"CLOSED with reupload_request blocked: {resp.text}"
            data = resp.json()
            assert data["success"] is True

    async def test_upload_photo_reupload_count_exceeded_returns_403(
        self, client: AsyncClient, seeded_voter: dict, db_session: AsyncSession
    ):
        """Upload should be blocked when photo_reupload_count >= 2."""
        await _valid_voter()

        # Set voter's reupload count to 2 (the max)
        result = await db_session.execute(
            select(Voter).where(Voter.voter_id == VOTER_UUID)
        )
        voter = result.scalar_one()
        voter.photo_reupload_count = 2
        await db_session.commit()

        resp = await client.post(
            "/api/v1/vote/upload-photo",
            files={"file": ("test.jpg", b"fake_image_data", "image/jpeg")},
        )
        assert resp.status_code == 403, f"Expected 403 but got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "maximum of 2" in data["detail"].lower()

    async def test_upload_photo_reupload_count_just_below_limit_allowed(
        self, client: AsyncClient, seeded_voter: dict, db_session: AsyncSession
    ):
        """Upload should succeed when photo_reupload_count is 1 (just below the limit)."""
        await _valid_voter()

        # Set voter's reupload count to 1 (still allowed)
        result = await db_session.execute(
            select(Voter).where(Voter.voter_id == VOTER_UUID)
        )
        voter = result.scalar_one()
        voter.photo_reupload_count = 1
        await db_session.commit()

        with patch("app.routes.vote.extract_face_embedding", return_value=[0.1] * 512), \
             patch("app.routes.vote.validate_image") as mock_validate, \
             patch("app.routes.vote.save_voter_face_image") as mock_save, \
             patch("os.makedirs"), \
             patch("builtins.open", mock_open()):
            mock_validate.return_value = MagicMock(passed=True)
            mock_save.return_value = MagicMock(reference_url="/uploads/faces/TEST/pending_test.jpg")

            resp = await client.post(
                "/api/v1/vote/upload-photo",
                files={"file": ("test.jpg", b"fake_image_data", "image/jpeg")},
            )
            assert resp.status_code == 200, f"Expected 200 but got {resp.status_code}: {resp.text}"
            data = resp.json()
            assert data["success"] is True

