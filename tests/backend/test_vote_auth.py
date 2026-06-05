"""
E2E test: Authentication required before voting.

Tests that every vote endpoint requires a valid JWT token:
  - POST /api/v1/vote/cast
  - GET  /api/v1/vote/status
  - POST /api/v1/vote/verify-id

Scenarios:
  - No auth token           -> 401
  - Expired / invalid token -> 401
  - Valid voter auth        -> 200 (status, verify-id)
  - Wrong role still passes get_current_user

Run:  pytest tests/backend/test_vote_auth.py -v --tb=short
"""

import uuid
import pytest
import pytest_asyncio
from unittest.mock import patch
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime, timezone, timedelta

# --- In-memory SQLite ---
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


class Base(DeclarativeBase):
    pass


# SQLite compilers for Postgres-specific types
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import INET, UUID as PostgresUUID


@compiles(INET, "sqlite")
def compile_inet_sqlite(element, compiler, **kw):
    return "VARCHAR(45)"


@compiles(PostgresUUID, "sqlite")
def compile_uuid_sqlite(element, compiler, **kw):
    return "VARCHAR(36)"


# Override session before importing app
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


# --- App & Model imports ---
from app.main import app
from app.db.session import get_db
from app.db.base import Base as AppBase
from app.models.voter import Voter
from app.models.election import Election
from app.models.position import Position
from app.models.election_phase import ElectionPhase
from app.enums.election_status import ElectionStatusEnum
from app.security.password_service import hash_password
from app.api.deps import get_current_user, get_voter_user, get_voting_session
from app.middleware.rate_limit import limiter

limiter.enabled = False


# --- Test IDs ---
# Use uuid.UUID objects for auth override so SQLAlchemy's PostgreSQL UUID
# bind processor (which calls .hex on the value) receives UUID objects,
# matching production behavior with PostgreSQL.
VOTER_UUID = uuid.uuid4()
VOTER_ID_STR = str(VOTER_UUID)
ELECTION_UUID = uuid.uuid4()
ELECTION_ID_STR = str(ELECTION_UUID)
POSITION_UUID = uuid.uuid4()


# --- Auth override (mutable -- switch per test) ---
_current_auth: dict = {}

async def mock_get_current_user():
    return _current_auth


# --- Fixtures ---

@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_db():
    """Create tables before each test, drop after."""
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
async def seeded_voter(db_session: AsyncSession):
    """Seed one verified voter with voting permission in a VOTING_OPEN election."""
    now = datetime.now(timezone.utc)

    election = Election(
        election_id=ELECTION_UUID,
        title="Vote Auth Test Election",
        description="Testing authentication",
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

    voter = Voter(
        voter_id=VOTER_UUID,
        college_email="voter@test.edu",
        password_hash=hash_password("VoterPass@123"),
        full_name="Test Voter",
        student_id="STUDENT01",
        department="CSE",
        year_of_study=3,
        is_verified=True,
        vote_permission=True,
        verification_id=hash_password("ABCD1234"),
        has_voted=False,
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


# =====================================================================
# Helper: auth override switchers
# =====================================================================

async def _no_auth():
    """Override get_current_user to raise 401 (expired/missing token)."""
    from fastapi import HTTPException, status

    async def _raise_401():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    app.dependency_overrides[get_current_user] = _raise_401
    app.dependency_overrides[get_voter_user] = _raise_401
    app.dependency_overrides[get_voting_session] = _raise_401


async def _valid_voter():
    """Set get_current_user to return a valid voter identity.
    NOTE: user_id is a uuid.UUID object, not a string.
    This matches what PostgreSQL's UUID type expects for bind parameters
    (the bind processor calls .hex on the value). The SQLite compile
    stores as VARCHAR(36) but the PostgreSQL bind processor still runs.
    """
    _current_auth.update({
        "user_id": VOTER_UUID,   # uuid.UUID object (not str) for SQLAlchemy bind compat
        "email": "voter@test.edu",
        "role": "voter",
    })
    app.dependency_overrides[get_current_user] = mock_get_current_user
    app.dependency_overrides[get_voter_user] = mock_get_current_user
    app.dependency_overrides[get_voting_session] = mock_get_current_user


async def _restore_voter():
    app.dependency_overrides[get_current_user] = mock_get_current_user
    app.dependency_overrides[get_voter_user] = mock_get_current_user
    app.dependency_overrides[get_voting_session] = mock_get_current_user


# =====================================================================
# Tests
# =====================================================================

@pytest.mark.asyncio
class TestVoteAuth:

    # -- POST /cast --------------------------------------------------------

    async def test_cast_no_auth_token_returns_401(self, client: AsyncClient, seeded_voter: dict):
        """POST /cast without auth -> 401."""
        await _no_auth()
        try:
            resp = await client.post(
                "/api/v1/vote/cast",
                json={"candidate_id": None, "verification_id": "test"},
            )
        finally:
            await _restore_voter()
        assert resp.status_code == 401
        detail = resp.json()["detail"].lower()
        assert any(w in detail for w in ["expired", "unauthorized", "invalid", "token"])

    async def test_cast_expired_token_returns_401(self, client: AsyncClient, seeded_voter: dict):
        """POST /cast with expired/invalid token -> 401 detail includes 'expired'."""
        await _no_auth()
        try:
            resp = await client.post(
                "/api/v1/vote/cast",
                json={"candidate_id": None, "verification_id": "test"},
            )
        finally:
            await _restore_voter()
        assert resp.status_code == 401
        assert "expired" in resp.json()["detail"].lower()

    # -- GET /status -------------------------------------------------------

    async def test_status_no_auth_token_returns_401(self, client: AsyncClient, seeded_voter: dict):
        """GET /status without auth -> 401."""
        await _no_auth()
        try:
            resp = await client.get("/api/v1/vote/status")
        finally:
            await _restore_voter()
        assert resp.status_code == 401
        detail = resp.json()["detail"].lower()
        assert any(w in detail for w in ["expired", "unauthorized", "invalid", "token"])

    async def test_status_expired_token_returns_401(self, client: AsyncClient, seeded_voter: dict):
        """GET /status with expired token -> 401."""
        await _no_auth()
        try:
            resp = await client.get("/api/v1/vote/status")
        finally:
            await _restore_voter()
        assert resp.status_code == 401
        assert "expired" in resp.json()["detail"].lower()

    async def test_status_valid_voter_returns_200(self, client: AsyncClient, seeded_voter: dict):
        """GET /status with valid voter token -> 200 + has_voted + vote_permission."""
        await _valid_voter()
        try:
            resp = await client.get("/api/v1/vote/status")
        finally:
            await _restore_voter()
        assert resp.status_code == 200, f"Status failed: {resp.text}"
        data = resp.json()
        assert "has_voted" in data
        assert "vote_permission" in data
        assert data["has_voted"] is False
        assert data["vote_permission"] is True

    # -- POST /verify-id ---------------------------------------------------

    async def test_verify_id_no_auth_token_returns_401(self, client: AsyncClient, seeded_voter: dict):
        """POST /verify-id without auth -> 401."""
        await _no_auth()
        try:
            resp = await client.post(
                "/api/v1/vote/verify-id",
                json={"verification_id": "ABCD1234"},
            )
        finally:
            await _restore_voter()
        assert resp.status_code == 401
        detail = resp.json()["detail"].lower()
        assert any(w in detail for w in ["expired", "unauthorized", "invalid", "token"])

    async def test_verify_id_expired_token_returns_401(self, client: AsyncClient, seeded_voter: dict):
        """POST /verify-id with expired token -> 401."""
        await _no_auth()
        try:
            resp = await client.post(
                "/api/v1/vote/verify-id",
                json={"verification_id": "ABCD1234"},
            )
        finally:
            await _restore_voter()
        assert resp.status_code == 401
        assert "expired" in resp.json()["detail"].lower()

    async def test_verify_id_valid_voter_returns_anti_replay_token(
        self, client: AsyncClient, seeded_voter: dict,
    ):
        """POST /verify-id with valid voter -> 200 + anti_replay_token (mocked)."""
        await _valid_voter()
        try:
            with patch("app.security.anti_replay_service.AntiReplayService.generate_token") as mock_gen:
                mock_gen.return_value = "test-anti-replay-token-12345"
                resp = await client.post(
                    "/api/v1/vote/verify-id",
                    json={"verification_id": "ABCD1234"},
                )
        finally:
            await _restore_voter()
        assert resp.status_code == 200, f"Verify-id failed: {resp.text}"
        data = resp.json()
        assert data["success"] is True
        assert data["anti_replay_token"] == "test-anti-replay-token-12345"

    # -- Role-based --------------------------------------------------------

    async def test_status_with_candidate_role_still_works(
        self, client: AsyncClient, seeded_voter: dict,
    ):
        """GET /status with candidate role -> 200 (get_current_user accepts any role)."""
        _current_auth.update({
            "user_id": VOTER_UUID,
            "email": "candidate@test.edu",
            "role": "candidate",
        })
        app.dependency_overrides[get_current_user] = mock_get_current_user
        try:
            resp = await client.get("/api/v1/vote/status")
        finally:
            await _restore_voter()
        assert resp.status_code == 200, f"Status with candidate role: {resp.text}"
        data = resp.json()
        assert "has_voted" in data
        assert data["has_voted"] is False

    # -- Bulk: all endpoints return 401 without auth -----------------------

    async def test_all_vote_endpoints_return_401_without_auth(
        self, client: AsyncClient, seeded_voter: dict,
    ):
        """Hit all 3 vote endpoints without auth -- every one returns 401."""
        await _no_auth()
        try:
            r1 = await client.post(
                "/api/v1/vote/cast",
                json={"candidate_id": None, "verification_id": "test"},
            )
            r2 = await client.get("/api/v1/vote/status")
            r3 = await client.post(
                "/api/v1/vote/verify-id",
                json={"verification_id": "ABCD1234"},
            )
        finally:
            await _restore_voter()

        assert r1.status_code == 401, f"/cast returned {r1.status_code}"
        assert r2.status_code == 401, f"/status returned {r2.status_code}"
        assert r3.status_code == 401, f"/verify-id returned {r3.status_code}"
