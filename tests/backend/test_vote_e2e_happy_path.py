"""
E2E test: Full voting happy path.

Tests the complete voter journey from verification ID entry through to vote
persistence, covering every step of the critical voting flow.

Run:  pytest tests/backend/test_vote_e2e_happy_path.py -v --tb=short
"""

import uuid
import hashlib
import asyncio
import pytest
import pytest_asyncio
import jwt
from unittest.mock import patch, MagicMock
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime, timezone, timedelta

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


class Base(DeclarativeBase):
    pass


from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import INET, UUID as PostgresUUID


@compiles(INET, "sqlite")
def compile_inet_sqlite(element, compiler, **kw):
    return "VARCHAR(45)"


@compiles(PostgresUUID, "sqlite")
def compile_uuid_sqlite(element, compiler, **kw):
    return "VARCHAR(36)"


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
from app.services.face_service import serialize_embedding, redis_biometric_token_cache
from app.api.deps import get_current_user, get_voter_user, get_voting_session
from app.middleware.rate_limit import limiter
from app.core.config import settings

limiter.enabled = False

VOTER_UUID = uuid.uuid4()
VOTER_ID_STR = str(VOTER_UUID)
ELECTION_UUID = uuid.uuid4()
ELECTION_ID_STR = str(ELECTION_UUID)
POSITION_UUID = uuid.uuid4()

VERIFICATION_CODE = "ABCD1234"
FACE_ENCODING = serialize_embedding([0.1] * 512)

_current_auth: dict = {}


async def mock_get_current_user():
    return _current_auth


@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_db():
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = mock_get_current_user
    app.dependency_overrides[get_voter_user] = mock_get_current_user
    app.dependency_overrides[get_voting_session] = mock_get_current_user
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
async def seeded_election(db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    election = Election(
        election_id=ELECTION_UUID,
        title="E2E Test Election",
        description="Full voting flow test",
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
    await db_session.commit()
    return {"election_id": ELECTION_ID_STR, "position_id": str(POSITION_UUID)}


@pytest_asyncio.fixture
async def seeded_voter(db_session: AsyncSession, seeded_election: dict):
    voter = Voter(
        voter_id=VOTER_UUID,
        college_email="e2evoter@test.edu",
        password_hash=hash_password("VoterPass@123"),
        full_name="E2E Voter",
        student_id="E2ESTU01",
        department="CSE",
        year_of_study=3,
        is_verified=True,
        vote_permission=True,
        verification_id=hash_password(VERIFICATION_CODE),
        has_voted=False,
        face_encoding=FACE_ENCODING,
        embedding_model_version="arcface_v1",
        failed_face_attempts=0,
    )
    db_session.add(voter)
    await db_session.commit()
    return {"voter_id": VOTER_ID_STR, "election_id": seeded_election["election_id"]}


@pytest_asyncio.fixture
async def voter_client(client: AsyncClient, seeded_voter: dict):
    _current_auth.clear()
    _current_auth.update({
        "user_id": VOTER_UUID,
        "email": "e2evoter@test.edu",
        "role": "voter",
    })
    app.dependency_overrides[get_current_user] = mock_get_current_user
    app.dependency_overrides[get_voter_user] = mock_get_current_user
    app.dependency_overrides[get_voting_session] = mock_get_current_user
    return client


def _make_face_session_token(
    voter_id=VOTER_ID_STR, ip="127.0.0.1", fp="test_device",
    jti="jti-e2e-test", expired=False,
):
    ip_hash = hashlib.sha256(ip.encode("utf-8")).hexdigest()
    fp_hash = hashlib.sha256(fp.encode("utf-8")).hexdigest()
    if expired:
        expire = datetime.now(timezone.utc) - timedelta(minutes=5)
        iat = datetime.now(timezone.utc) - timedelta(minutes=6)
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=2)
        iat = datetime.now(timezone.utc)
    payload = {
        "sub": voter_id, "aud": "vote_system", "purpose": "face_cast",
        "jti": jti, "nonce": "nonce-e2e", "ip": ip_hash, "fp": fp_hash,
        "exp": expire, "iat": iat,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _face_passive_mocks():
    return [
        patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True),
        patch("app.security.anti_replay_service.AntiReplayService.generate_token", return_value="rt-face"),
        patch("app.routes.vote.normalize_image", return_value=MagicMock()),
        patch("app.routes.vote.check_image_quality", return_value=(True, None)),
        patch("app.routes.vote.extract_face_embedding", return_value=[0.1] * 512),
        patch("app.routes.vote.check_passive_liveness", return_value=(True, "passed")),
        patch("app.routes.vote.compute_majority_match", return_value=(True, 5, 5, 92.5)),
        patch("app.services.face_service.replay_cache.is_replay_and_add", return_value=False),
    ]


def _start_mocks(mocks):
    for m in mocks:
        m.start()


def _stop_mocks(mocks):
    for m in mocks:
        try:
            m.stop()
        except RuntimeError:
            pass


def _register_biometric_token(face_session_token):
    tp = jwt.decode(face_session_token, settings.JWT_SECRET_KEY, audience="vote_system", algorithms=[settings.JWT_ALGORITHM])
    return tp["jti"]


# ====================================================================
# Happy Path
# ====================================================================


@pytest.mark.asyncio
class TestVotingHappyPath:

    async def test_full_voting_flow(self, voter_client, db_session):
        """verify-id -> face-verify -> cast -> has_voted=True -> status reflects it."""
        # Step 1: Verify ID
        with patch("app.security.anti_replay_service.AntiReplayService.generate_token", return_value="rt1"):
            resp = await voter_client.post("/api/v1/vote/verify-id", json={"verification_id": VERIFICATION_CODE})
            assert resp.status_code == 200, f"Step 1 failed: {resp.text}"
            assert resp.json()["success"] is True
            rt1 = resp.json()["anti_replay_token"]

        # Step 2: Face Verification
        mocks = _face_passive_mocks()
        _start_mocks(mocks)
        try:
            resp = await voter_client.post(
                "/api/v1/vote/verify-face-passive",
                json={"frames": ["data:image/jpeg;base64,dGVzdA=="] * 5, "anti_replay_token": rt1},
                headers={"X-Client-Signature": "test_device"},
            )
            assert resp.status_code == 200, f"Step 2 failed: {resp.text}"
            assert resp.json()["success"] is True
            fst = resp.json()["face_session_token"]
            rt2 = resp.json()["anti_replay_token"]
        finally:
            _stop_mocks(mocks)

        # Step 3: Cast Vote
        jti = _register_biometric_token(fst)
        await redis_biometric_token_cache.register_token(jti, VOTER_ID_STR)

        with patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True), \
             patch("app.services.ledger_service.append_to_secure_vault", return_value="vault-hash"):
            resp = await voter_client.post(
                "/api/v1/vote/cast",
                json={"candidate_id": None, "verification_id": VERIFICATION_CODE, "face_session_token": fst, "anti_replay_token": rt2},
                headers={"X-Client-Signature": "test_device"},
            )
            assert resp.status_code == 200, f"Step 3 failed: {resp.text}"
            assert resp.json()["has_voted"] is True

        # Step 4: Verify DB
        result = await db_session.execute(select(Voter).where(Voter.voter_id == VOTER_UUID))
        voter = result.scalar_one()
        assert voter.has_voted is True

        # Step 5: Verify status endpoint
        resp = await voter_client.get("/api/v1/vote/status")
        assert resp.status_code == 200
        assert resp.json()["has_voted"] is True
        assert resp.json()["vote_permission"] is True

    async def test_vote_record_exists_in_db(self, voter_client, db_session):
        """A Vote row should exist with correct fields after casting."""
        with patch("app.security.anti_replay_service.AntiReplayService.generate_token", return_value="rt1"):
            resp = await voter_client.post("/api/v1/vote/verify-id", json={"verification_id": VERIFICATION_CODE})
            assert resp.status_code == 200
            rt = resp.json()["anti_replay_token"]

        mocks = _face_passive_mocks()
        _start_mocks(mocks)
        try:
            resp = await voter_client.post(
                "/api/v1/vote/verify-face-passive",
                json={"frames": ["data:image/jpeg;base64,dGVzdA=="] * 5, "anti_replay_token": rt},
                headers={"X-Client-Signature": "test_device"},
            )
            assert resp.status_code == 200
            fst = resp.json()["face_session_token"]
            rt2 = resp.json()["anti_replay_token"]
        finally:
            _stop_mocks(mocks)

        jti = _register_biometric_token(fst)
        await redis_biometric_token_cache.register_token(jti, VOTER_ID_STR)

        with patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True), \
             patch("app.services.ledger_service.append_to_secure_vault", return_value="vh"):
            resp = await voter_client.post(
                "/api/v1/vote/cast",
                json={"candidate_id": None, "verification_id": VERIFICATION_CODE, "face_session_token": fst, "anti_replay_token": rt2},
                headers={"X-Client-Signature": "test_device"},
            )
            assert resp.status_code == 200

        vote_result = await db_session.execute(select(Vote))
        votes = vote_result.scalars().all()
        assert len(votes) == 1
        vote = votes[0]
        assert vote.election_id is not None
        assert vote.position_id is not None
        assert vote.voter_token_hash is not None
        assert vote.current_hash is not None
        assert vote.ledger_sequence is not None

    async def test_double_vote_prevention(self, voter_client, db_session):
        """Second vote attempt is blocked with 400."""
        with patch("app.security.anti_replay_service.AntiReplayService.generate_token", return_value="rt1"):
            resp = await voter_client.post("/api/v1/vote/verify-id", json={"verification_id": VERIFICATION_CODE})
            rt1 = resp.json()["anti_replay_token"]

        mocks = _face_passive_mocks()
        _start_mocks(mocks)
        try:
            resp = await voter_client.post(
                "/api/v1/vote/verify-face-passive",
                json={"frames": ["data:image/jpeg;base64,dGVzdA=="] * 5, "anti_replay_token": rt1},
                headers={"X-Client-Signature": "test_device"},
            )
            fst1 = resp.json()["face_session_token"]
            rt2 = resp.json()["anti_replay_token"]
        finally:
            _stop_mocks(mocks)

        jti = _register_biometric_token(fst1)
        await redis_biometric_token_cache.register_token(jti, VOTER_ID_STR)

        with patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True), \
             patch("app.services.ledger_service.append_to_secure_vault", return_value="h"):
            resp = await voter_client.post(
                "/api/v1/vote/cast",
                json={"candidate_id": None, "verification_id": VERIFICATION_CODE, "face_session_token": fst1, "anti_replay_token": rt2},
                headers={"X-Client-Signature": "test_device"},
            )
            assert resp.status_code == 200
            assert resp.json()["has_voted"] is True

        # Second attempt: verify-id rejected
        with patch("app.security.anti_replay_service.AntiReplayService.generate_token", return_value="rt3"):
            resp = await voter_client.post("/api/v1/vote/verify-id", json={"verification_id": VERIFICATION_CODE})
            assert resp.status_code == 400
            assert "already cast" in resp.json()["detail"].lower()


# ====================================================================
# Edge Cases
# ====================================================================


@pytest.mark.asyncio
class TestVotingEdgeCases:

    async def test_wrong_verification_id(self, voter_client):
        resp = await voter_client.post("/api/v1/vote/verify-id", json={"verification_id": "WRONGCOD"})
        assert resp.status_code == 403
        assert "does not match" in resp.json()["detail"].lower()

    async def test_expired_face_token_blocks_cast(self, voter_client):
        expired_token = _make_face_session_token(expired=True)
        resp = await voter_client.post(
            "/api/v1/vote/cast",
            json={"candidate_id": None, "verification_id": VERIFICATION_CODE, "face_session_token": expired_token, "anti_replay_token": "any"},
            headers={"X-Client-Signature": "test_device"},
        )
        assert resp.status_code == 401
        assert "expired" in resp.json()["detail"].lower()

    async def test_missing_face_token_blocks_cast(self, voter_client):
        original = settings.ENABLE_FACE_VERIFICATION
        settings.ENABLE_FACE_VERIFICATION = True
        try:
            with patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True):
                resp = await voter_client.post(
                    "/api/v1/vote/cast",
                    json={"candidate_id": None, "verification_id": VERIFICATION_CODE, "anti_replay_token": "any"},
                )
            assert resp.status_code == 400
            assert "biometric face token is required" in resp.json()["detail"].lower()
        finally:
            settings.ENABLE_FACE_VERIFICATION = original

    async def test_voter_without_permission_blocked(self, voter_client, db_session):
        result = await db_session.execute(select(Voter).where(Voter.voter_id == VOTER_UUID))
        voter = result.scalar_one()
        voter.vote_permission = False
        await db_session.commit()

        fake_token = _make_face_session_token()
        tp = jwt.decode(fake_token, settings.JWT_SECRET_KEY, audience="vote_system", algorithms=[settings.JWT_ALGORITHM])
        await redis_biometric_token_cache.register_token(tp["jti"], VOTER_ID_STR)

        with patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True):
            resp = await voter_client.post(
                "/api/v1/vote/cast",
                json={"candidate_id": None, "verification_id": VERIFICATION_CODE, "face_session_token": fake_token, "anti_replay_token": "tok"},
                headers={"X-Client-Signature": "test_device"},
            )
        assert resp.status_code == 403
        assert "permission" in resp.json()["detail"].lower()

    async def test_voting_not_open_blocks_cast(self, voter_client, db_session):
        result = await db_session.execute(select(Election).where(Election.election_id == ELECTION_UUID))
        election = result.scalar_one()
        election.status = ElectionStatusEnum.CLOSED.value
        election.voting_end = datetime.now(timezone.utc) - timedelta(hours=1)
        await db_session.commit()

        fake_token = _make_face_session_token()
        tp = jwt.decode(fake_token, settings.JWT_SECRET_KEY, audience="vote_system", algorithms=[settings.JWT_ALGORITHM])
        await redis_biometric_token_cache.register_token(tp["jti"], VOTER_ID_STR)

        with patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True):
            resp = await voter_client.post(
                "/api/v1/vote/cast",
                json={"candidate_id": None, "verification_id": VERIFICATION_CODE, "face_session_token": fake_token, "anti_replay_token": "tok"},
                headers={"X-Client-Signature": "test_device"},
            )
        assert resp.status_code in (400, 403)


# ====================================================================
# Null checks (Bug #1 fix validation)
# ====================================================================


@pytest.mark.asyncio
class TestCastVoteNullChecks:

    async def test_cast_without_voter_returns_404(self, voter_client, db_session):
        result = await db_session.execute(select(Voter).where(Voter.voter_id == VOTER_UUID))
        voter = result.scalar_one()
        await db_session.delete(voter)
        await db_session.commit()

        fake_token = _make_face_session_token()
        tp = jwt.decode(fake_token, settings.JWT_SECRET_KEY, audience="vote_system", algorithms=[settings.JWT_ALGORITHM])
        await redis_biometric_token_cache.register_token(tp["jti"], VOTER_ID_STR)

        with patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True):
            resp = await voter_client.post(
                "/api/v1/vote/cast",
                json={"candidate_id": None, "verification_id": VERIFICATION_CODE, "face_session_token": fake_token, "anti_replay_token": "tok"},
                headers={"X-Client-Signature": "test_device"},
            )
        assert resp.status_code == 404
        assert "voter" in resp.json()["detail"].lower()

    async def test_cast_without_election_returns_404(self, voter_client, db_session):
        result = await db_session.execute(select(Election).where(Election.election_id == ELECTION_UUID))
        election = result.scalar_one()
        await db_session.delete(election)
        await db_session.commit()

        fake_token = _make_face_session_token()
        tp = jwt.decode(fake_token, settings.JWT_SECRET_KEY, audience="vote_system", algorithms=[settings.JWT_ALGORITHM])
        await redis_biometric_token_cache.register_token(tp["jti"], VOTER_ID_STR)

        with patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True):
            resp = await voter_client.post(
                "/api/v1/vote/cast",
                json={"candidate_id": None, "verification_id": VERIFICATION_CODE, "face_session_token": fake_token, "anti_replay_token": "tok"},
                headers={"X-Client-Signature": "test_device"},
            )
        assert resp.status_code == 404
        assert "election" in resp.json()["detail"].lower()


# ====================================================================
# Verify-ID lockout (Bug #3 fix validation)
# ====================================================================


@pytest.mark.asyncio
class TestVerifyIdLockout:

    async def test_lockout_after_3_wrong_codes(self, voter_client, db_session):
        """3 wrong verification codes triggers backend lockout (403 with 'locked')."""
        from app.routes.vote import redis_verify_id_lockout

        call_count = 0

        async def mock_check(voter_id):
            if call_count >= 3:
                return True, 900
            return False, None

        async def mock_increment(voter_id):
            nonlocal call_count
            call_count += 1
            if call_count >= 3:
                return True, 900
            return False, None

        async def mock_clear(voter_id):
            nonlocal call_count
            call_count = 0

        with patch.object(redis_verify_id_lockout, "check_lockout", side_effect=mock_check), \
             patch.object(redis_verify_id_lockout, "increment_and_check", side_effect=mock_increment), \
             patch.object(redis_verify_id_lockout, "clear", side_effect=mock_clear):
            for i in range(3):
                resp = await voter_client.post("/api/v1/vote/verify-id", json={"verification_id": "WRONGCOD"})
                if i < 2:
                    assert resp.status_code == 403
                    assert "does not match" in resp.json()["detail"].lower()
                else:
                    assert resp.status_code == 403
                    detail = resp.json()["detail"].lower()
                    assert "locked" in detail or "too many" in detail

            # 4th attempt should also be locked
            resp = await voter_client.post("/api/v1/vote/verify-id", json={"verification_id": VERIFICATION_CODE})
            assert resp.status_code == 403
            detail = resp.json()["detail"].lower()
            assert "locked" in detail or "too many" in detail

    async def test_correct_code_resets_lockout_counter(self, voter_client, db_session):
        """Correct code after 1 failure clears the counter."""
        from app.routes.vote import redis_verify_id_lockout

        call_count = 0

        async def mock_check(voter_id):
            return False, None

        async def mock_increment(voter_id):
            nonlocal call_count
            call_count += 1
            # Simulate that we had 1 prior failure but not locked yet
            return False, None

        async def mock_clear(voter_id):
            nonlocal call_count
            call_count = 0

        with patch.object(redis_verify_id_lockout, "check_lockout", side_effect=mock_check), \
             patch.object(redis_verify_id_lockout, "increment_and_check", side_effect=mock_increment), \
             patch.object(redis_verify_id_lockout, "clear", side_effect=mock_clear), \
             patch("app.security.anti_replay_service.AntiReplayService.generate_token", return_value="rt-ok"):
            # 1 failure
            resp = await voter_client.post("/api/v1/vote/verify-id", json={"verification_id": "WRONGCOD"})
            assert resp.status_code == 403

            # Correct code succeeds and resets counter
            resp = await voter_client.post("/api/v1/vote/verify-id", json={"verification_id": VERIFICATION_CODE})
            assert resp.status_code == 200
            assert resp.json()["success"] is True

            # Another failure starts fresh (not locked yet)
            resp = await voter_client.post("/api/v1/vote/verify-id", json={"verification_id": "WRONGCOD"})
            assert resp.status_code == 403
            assert "does not match" in resp.json()["detail"].lower()
            assert "locked" not in resp.json()["detail"].lower()


# ====================================================================
# Concurrency: double-vote prevention under simultaneous requests
# ====================================================================
#
# NOTE: SQLite ignores SELECT FOR UPDATE and uses snapshot isolation,
# so the DB-level TOCTOU guard cannot be tested through the HTTP
# layer on SQLite.  These tests verify:
#   (a) the application-level lock serializes concurrent requests
#   (b) both requests complete without crashing or deadlocking
#   (c) the voter ends up in a consistent state
# True double-vote prevention via row locks is guaranteed by PostgreSQL
# and tested by the sequential test_double_vote_prevention above.


def _cast_payload(verification_id=VERIFICATION_CODE, fst=None, anti_replay_token="rt-concurrent"):
    """Build a cast_vote JSON payload with a face session token."""
    if fst is None:
        fst = _make_face_session_token(jti=f"jti-concurrent-{uuid.uuid4().hex[:8]}")
    return {
        "candidate_id": None,
        "verification_id": verification_id,
        "face_session_token": fst,
        "anti_replay_token": anti_replay_token,
    }


async def _setup_concurrent_session(client: AsyncClient):
    """Walk through verify-id + face-verify and return tokens for cast_vote."""
    with patch("app.security.anti_replay_service.AntiReplayService.generate_token", return_value="rt-vid"):
        resp = await client.post(
            "/api/v1/vote/verify-id",
            json={"verification_id": VERIFICATION_CODE},
        )
        assert resp.status_code == 200, f"verify-id failed: {resp.text}"
        vid_rt = resp.json()["anti_replay_token"]

    mocks = _face_passive_mocks()
    _start_mocks(mocks)
    try:
        resp = await client.post(
            "/api/v1/vote/verify-face-passive",
            json={"frames": ["data:image/jpeg;base64,dGVzdA=="] * 5, "anti_replay_token": vid_rt},
            headers={"X-Client-Signature": "test_device"},
        )
        assert resp.status_code == 200, f"face-verify failed: {resp.text}"
        fst = resp.json()["face_session_token"]
        cast_rt = resp.json()["anti_replay_token"]
    finally:
        _stop_mocks(mocks)

    return fst, cast_rt


class _BarrierLock:
    """Lock that uses asyncio.Barrier to force both concurrent tasks into
    the critical section before either proceeds.

    httpx ASGITransport serializes requests, so plain asyncio.Lock is
    never contested.  The barrier blocks both tasks until they both
    arrive, then the inner lock serializes them — guaranteeing the
    TOCTOU re-check path is exercised.
    """

    def __init__(self, barrier: asyncio.Barrier):
        self._barrier = barrier
        self._inner = asyncio.Lock()

    async def acquire(self):
        await self._barrier.wait()          # block until BOTH tasks arrive
        await self._inner.acquire()         # then serialize with a real lock

    def release(self):
        if self._inner.locked():
            self._inner.release()

    def locked(self):
        return self._inner.locked()


@pytest.mark.asyncio
class TestConcurrentVote:

    async def test_concurrent_cast_lock_serialization(self, voter_client, db_session):
        """
        Two concurrent cast_vote requests for the same voter.

        Uses a BarrierLock that forces both tasks into the critical
        section simultaneously, verifying:
          - Both requests complete without crashing or deadlocking
          - The voter ends up in a consistent has_voted=True state
          - The lock acquire/release calls match (no lock leak)
        """
        fst1, rt1 = await _setup_concurrent_session(voter_client)
        fst2, rt2 = await _setup_concurrent_session(voter_client)

        tp1 = jwt.decode(fst1, settings.JWT_SECRET_KEY, audience="vote_system",
                         algorithms=[settings.JWT_ALGORITHM])
        tp2 = jwt.decode(fst2, settings.JWT_SECRET_KEY, audience="vote_system",
                         algorithms=[settings.JWT_ALGORITHM])
        await redis_biometric_token_cache.register_token(tp1["jti"], VOTER_ID_STR)
        await redis_biometric_token_cache.register_token(tp2["jti"], VOTER_ID_STR)

        barrier = asyncio.Barrier(2)
        sync_lock = _BarrierLock(barrier)

        payload1 = _cast_payload(fst=fst1, anti_replay_token=rt1)
        payload2 = _cast_payload(fst=fst2, anti_replay_token=rt2)

        with patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True), \
             patch("app.services.ledger_service.append_to_secure_vault", return_value="vault"), \
             patch("app.routes.vote.get_sqlite_lock", return_value=sync_lock):

            results = await asyncio.gather(
                voter_client.post("/api/v1/vote/cast", json=payload1,
                                 headers={"X-Client-Signature": "test_device"}),
                voter_client.post("/api/v1/vote/cast", json=payload2,
                                 headers={"X-Client-Signature": "test_device"}),
                return_exceptions=True,
            )

        # --- No crashes or exceptions ---
        for r in results:
            assert not isinstance(r, Exception), f"Unexpected exception: {r}"

        # --- Both returned valid HTTP status codes ---
        statuses = [r.status_code for r in results]
        for s in statuses:
            assert s in (200, 400, 403), f"Unexpected status code: {s}"

        # --- Lock was not leaked (acquire/release balanced) ---
        assert not sync_lock.locked(), "Lock should be released after both tasks complete"

        # --- Voter is in a consistent final state ---
        voter_result = await db_session.execute(select(Voter).where(Voter.voter_id == VOTER_UUID))
        voter = voter_result.scalar_one()
        assert voter.has_voted is True, "Voter should be marked as voted"

    async def test_toctou_guard_rejects_after_first_vote(self, voter_client, db_session):
        """Sequential double-vote prevention through the cast endpoint.

        Builds a fresh face session token directly (bypasses verify-id
        which checks has_voted) to exercise the has_voted re-check
        inside the cast_vote critical section.
        """
        # --- First vote (happy path) ---
        fst1, rt1 = await _setup_concurrent_session(voter_client)
        tp1 = jwt.decode(fst1, settings.JWT_SECRET_KEY, audience="vote_system",
                         algorithms=[settings.JWT_ALGORITHM])
        await redis_biometric_token_cache.register_token(tp1["jti"], VOTER_ID_STR)

        with patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True), \
             patch("app.services.ledger_service.append_to_secure_vault", return_value="vault"):
            resp = await voter_client.post(
                "/api/v1/vote/cast",
                json=_cast_payload(fst=fst1, anti_replay_token=rt1),
                headers={"X-Client-Signature": "test_device"},
            )
            assert resp.status_code == 200, f"First vote failed: {resp.text}"
            assert resp.json()["has_voted"] is True

        # --- Second attempt: build a fresh face session token directly
        #     (cannot re-run verify-id because it checks has_voted) ---
        fst2 = _make_face_session_token(jti=f"jti-toctou-{uuid.uuid4().hex[:8]}")
        tp2 = jwt.decode(fst2, settings.JWT_SECRET_KEY, audience="vote_system",
                         algorithms=[settings.JWT_ALGORITHM])
        await redis_biometric_token_cache.register_token(tp2["jti"], VOTER_ID_STR)

        with patch("app.security.anti_replay_service.AntiReplayService.validate_and_consume", return_value=True), \
             patch("app.services.ledger_service.append_to_secure_vault", return_value="vault"):
            resp = await voter_client.post(
                "/api/v1/vote/cast",
                json=_cast_payload(fst=fst2, anti_replay_token="rt-toctou"),
                headers={"X-Client-Signature": "test_device"},
            )
            assert resp.status_code == 400, (
                f"Expected 400 for second vote, got {resp.status_code}: {resp.text}"
            )
            assert "already" in resp.json()["detail"].lower(), (
                f"Detail should mention 'already voted': {resp.json()['detail']}"
            )

        # --- Exactly 1 Vote row in DB ---
        vote_result = await db_session.execute(select(Vote))
        votes = vote_result.scalars().all()
        assert len(votes) == 1, f"Expected 1 Vote row, got {len(votes)}"


# ====================================================================
# Unit test: increment_face_attempts_with_lock serialization
# ====================================================================


class TestIncrementFaceAttemptsLock:
    """Verify that increment_face_attempts_with_lock uses SELECT FOR UPDATE
    and correctly increments the counter under serialized access.

    On PostgreSQL, SELECT FOR UPDATE takes a row-level lock that blocks
    the second caller until the first commits.  On SQLite, FOR UPDATE is
    a no-op — we simulate the serialized behavior with an asyncio.Barrier
    so the second call reads after the first commits.
    """

    @pytest.mark.asyncio
    async def test_for_update_is_used_in_query(self, db_session, seeded_voter):
        """The function must use SELECT FOR UPDATE to acquire a row lock."""
        from app.routes.vote import increment_face_attempts_with_lock
        # Compile with PostgreSQL dialect — SQLite strips FOR UPDATE
        # from its compiled output, but PostgreSQL renders it.
        from sqlalchemy.dialects.postgresql import dialect as pg_dialect

        # Reset counter
        voter = (
            await db_session.execute(
                select(Voter).where(Voter.voter_id == VOTER_UUID)
            )
        ).scalar_one()
        voter.failed_face_attempts = 0
        await db_session.commit()

        # Spy on db.execute to capture the query
        executed_queries = []
        original_execute = db_session.execute

        async def spy_execute(query, *args, **kwargs):
            executed_queries.append(query)
            return await original_execute(query, *args, **kwargs)

        db_session.execute = spy_execute
        try:
            await increment_face_attempts_with_lock(db_session, VOTER_UUID)
        finally:
            db_session.execute = original_execute

        # Compile each captured query against PostgreSQL dialect
        # to verify FOR UPDATE is present
        has_for_update = False
        for q in executed_queries:
            try:
                compiled = q.compile(
                    dialect=pg_dialect(),
                    compile_kwargs={"literal_binds": True},
                )
                sql = str(compiled).upper()
                if "FOR UPDATE" in sql:
                    has_for_update = True
                    break
            except Exception:
                continue

        assert has_for_update, (
            "increment_face_attempts_with_lock must use SELECT FOR UPDATE"
        )

    @pytest.mark.asyncio
    async def test_serialized_increments_count_correctly(self, db_session, seeded_voter):
        """Two serialized calls (simulating PostgreSQL FOR UPDATE behavior)
        starting from 0 must produce count=2 — no lost update.

        Uses a Barrier so the second call reads after the first commits,
        which is equivalent to what PostgreSQL's row lock guarantees.
        """
        from app.routes.vote import increment_face_attempts_with_lock

        # Reset counter
        voter = (
            await db_session.execute(
                select(Voter).where(Voter.voter_id == VOTER_UUID)
            )
        ).scalar_one()
        voter.failed_face_attempts = 0
        await db_session.commit()

        # Barrier ensures the first call completes (commits) before the second
        # reads, simulating PostgreSQL's SELECT FOR UPDATE row lock.
        after_first = asyncio.Barrier(2)

        async def first_call():
            async with TestSessionLocal() as s:
                result = await increment_face_attempts_with_lock(s, VOTER_UUID)
            await after_first.wait()  # signal: "I committed"
            return result

        async def second_call():
            await after_first.wait()  # wait for first to commit
            async with TestSessionLocal() as s:
                return await increment_face_attempts_with_lock(s, VOTER_UUID)

        r1, r2 = await asyncio.gather(first_call(), second_call())

        # Both calls returned valid results
        assert r1[0] == 1  # first call: 0 → 1
        assert r2[0] == 2  # second call: 1 → 2
        assert r1[1] is None  # no lockout at count 1
        assert r2[1] is None  # no lockout at count 2

        # Final count is exactly 2
        async with TestSessionLocal() as verify:
            final = (
                await verify.execute(
                    select(Voter).where(Voter.voter_id == VOTER_UUID)
                )
            ).scalar_one()
            assert final.failed_face_attempts == 2, (
                f"Expected 2, got {final.failed_face_attempts} — lost update"
            )

    @pytest.mark.asyncio
    async def test_lockout_triggered_when_threshold_crossed(self, db_session, seeded_voter):
        """Starting from count=2, a call that pushes to 3 must trigger lockout.
        A second serialized call pushing to 4 must also trigger lockout.
        """
        from app.routes.vote import increment_face_attempts_with_lock
        from app.services.face_service import redis_face_lockout

        # Seed voter at count=2
        voter = (
            await db_session.execute(
                select(Voter).where(Voter.voter_id == VOTER_UUID)
            )
        ).scalar_one()
        voter.failed_face_attempts = 2
        await db_session.commit()

        lockout_calls = []

        async def mock_set_lockout(voter_id, minutes):
            lockout_calls.append((voter_id, minutes))

        after_first = asyncio.Barrier(2)

        async def first_call():
            async with TestSessionLocal() as s:
                with patch.object(
                    redis_face_lockout, "set_lockout", side_effect=mock_set_lockout
                ):
                    result = await increment_face_attempts_with_lock(s, VOTER_UUID)
            await after_first.wait()
            return result

        async def second_call():
            await after_first.wait()
            async with TestSessionLocal() as s:
                with patch.object(
                    redis_face_lockout, "set_lockout", side_effect=mock_set_lockout
                ):
                    return await increment_face_attempts_with_lock(s, VOTER_UUID)

        r1, r2 = await asyncio.gather(first_call(), second_call())

        # First call: 2 → 3 (triggers lockout), second: 3 → 4 (triggers lockout)
        assert r1[0] == 3
        assert r1[1] is not None  # lockout_minutes set
        assert r2[0] == 4
        assert r2[1] is not None  # lockout_minutes set

        # Both calls triggered lockout
        assert len(lockout_calls) == 2, (
            f"Expected 2 lockout calls, got {len(lockout_calls)}"
        )

        # Final count is 4
        async with TestSessionLocal() as verify:
            final = (
                await verify.execute(
                    select(Voter).where(Voter.voter_id == VOTER_UUID)
                )
            ).scalar_one()
            assert final.failed_face_attempts == 4
