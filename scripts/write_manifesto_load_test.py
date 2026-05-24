"""Generate tests/backend/test_manifesto_load.py — a standalone pytest file."""

import pathlib

TEST_CONTENT = r'''"""
Load test for the manifesto upload endpoint — 50+ concurrent requests.

Tests:
  1. 50 concurrent uploads all succeed (200 OK)
  2. All 50 return unique URLs (no duplicates)
  3. Performance metrics measured: total time, avg/min/max latency

Run:  pytest tests/backend/test_manifesto_load.py -v --tb=short
      pytest tests/backend/test_manifesto_load.py -v -k "stress"  # higher concurrency
"""

import uuid
import time
import asyncio
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime, timezone, timedelta

# ── Config ──────────────────────────────────────────────────
CONCURRENCY_LEVEL = 50          # base number of concurrent uploads
STRESS_CONCURRENCY = 150        # higher level for stress test
UPLOAD_TIMEOUT_SECONDS = 30     # max acceptable wall time

# ── In-memory SQLite ───────────────────────────────────────
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
import app.db.session as db_module

test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

async def override_get_db():
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

# ── App & Model imports ────────────────────────────────────
from app.main import app
from app.db.session import get_db
from app.db.base import Base as AppBase
from app.models.voter import Voter
from app.models.candidate import Candidate
from app.models.election import Election
from app.models.position import Position
from app.enums.election_status import ElectionStatusEnum
from app.enums.candidate_status import CandidateStatusEnum
from app.security.password_service import hash_password
from app.api.deps import get_current_user, get_admin_user
from app.middleware.rate_limit import limiter
from app.services.supabase_storage import UploadedStorageObject

app.dependency_overrides[get_db] = override_get_db
limiter.enabled = False

# ── Test IDs ────────────────────────────────────────────────
CANDIDATE_VOTER_ID = "00000000-0000-0000-0000-000000000001"
CANDIDATE_UUID = uuid.UUID(CANDIDATE_VOTER_ID)
CANDIDATE_ID = "33333333-3333-3333-3333-333333333333"
ELECTION_ID = "11111111-1111-1111-1111-111111111111"
POSITION_ID = "22222222-2222-2222-2222-222222222222"

# ── Auth override ───────────────────────────────────────────
_current_auth: dict = {}

async def mock_get_current_user():
    return _current_auth

async def mock_get_admin_user():
    return {"user_id": "admin-uuid", "email": "admin@test.edu", "role": "admin"}

app.dependency_overrides[get_current_user] = mock_get_current_user
app.dependency_overrides[get_admin_user] = mock_get_admin_user

# ── Fixtures ────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_db():
    """Create tables before each test, drop after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(AppBase.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(AppBase.metadata.drop_all)


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
async def seeded_data(db_session: AsyncSession):
    """Seed one approved candidate for upload tests."""
    voter = Voter(
        voter_id=CANDIDATE_UUID,
        college_email="candidate@test.edu",
        password_hash=hash_password("CandPass@123"),
        full_name="Test Candidate",
        student_id="STUDENT01",
        department="CSE",
        year_of_study=3,
        is_verified=True,
        vote_permission=True,
        verification_id=hash_password("12345678"),
    )
    db_session.add(voter)

    now = datetime.now(timezone.utc)
    election = Election(
        election_id=uuid.UUID(ELECTION_ID),
        title="Test Election 2026",
        description="Load test election",
        status=ElectionStatusEnum.VOTING_OPEN.value,
        voting_start=now - timedelta(hours=1),
        voting_end=now + timedelta(hours=1),
        registration_start=now - timedelta(days=7),
        registration_end=now - timedelta(hours=2),
    )
    db_session.add(election)

    position = Position(
        position_id=uuid.UUID(POSITION_ID),
        election_id=election.election_id,
        title="President",
    )
    db_session.add(position)

    candidate = Candidate(
        candidate_id=uuid.UUID(CANDIDATE_ID),
        voter_id=voter.voter_id,
        election_id=election.election_id,
        position_id=position.position_id,
        mobile_number="9876543210",
        mobile_verified=True,
        status=CandidateStatusEnum.APPROVED.value,
    )
    db_session.add(candidate)
    await db_session.commit()

    return {
        "voter_id": str(voter.voter_id),
        "candidate_id": str(candidate.candidate_id),
    }


def _run_concurrent_uploads(client, n: int):
    """Fire n concurrent upload requests using a single patched mock."""
    _current_auth.update({
        "user_id": CANDIDATE_VOTER_ID,
        "email": "candidate@test.edu",
        "role": "candidate",
    })

    fake_base_url = (
        "https://supabase.test/storage/v1/object/public/"
        "campaign-media/manifestos/load"
    )

    # Single side_effect mock — safely increments a counter
    _call_idx = 0
    def _make_side_effect():
        nonlocal _call_idx
        async def _side_effect(candidate_id, filename, content_type, data):
            nonlocal _call_idx
            i = _call_idx
            _call_idx += 1
            return UploadedStorageObject(
                path=f"manifestos/load/img_{i}.png",
                public_url=f"{fake_base_url}/img_{i}.png",
            )
        return _side_effect

    with patch("app.routes.candidates.settings.SUPABASE_URL", "https://test.supabase.co"), \
         patch("app.routes.candidates.settings.SUPABASE_SERVICE_ROLE_KEY", "test-key"), \
         patch(
             "app.routes.candidates.upload_manifesto_media",
             new_callable=AsyncMock,
             side_effect=_make_side_effect(),
         ):
        tasks = [
            client.post(
                "/api/v1/candidates/me/manifesto/upload",
                files={"file": (f"img_{i}.png", b"fake-image-data", "image/png")},
            )
            for i in range(n)
        ]
        return asyncio.gather(*tasks)

    # ── Tests ──────────────────────────────────────────────


class TestManifestoLoad:

    @pytest.mark.asyncio
    async def test_50_concurrent_uploads(self, client, seeded_data):
        """50 concurrent uploads → all 200, unique URLs, under 30s."""
        start = time.monotonic()
        responses = await _run_concurrent_uploads(client, CONCURRENCY_LEVEL)
        elapsed = time.monotonic() - start

        # All returned 200
        errors = [
            (i, r.status_code, r.text)
            for i, r in enumerate(responses)
            if r.status_code != 200
        ]
        assert not errors, (
            f"{len(errors)}/{CONCURRENCY_LEVEL} uploads failed:\n" +
            "\n".join(f"  #{i}: {s} — {t[:120]}" for i, s, t in errors[:5])
        )

        # All URLs are unique
        urls = [r.json()["url"] for r in responses]
        assert len(set(urls)) == CONCURRENCY_LEVEL, (
            f"Expected {CONCURRENCY_LEVEL} unique URLs, got {len(set(urls))}"
        )

        # Timing assertion
        assert elapsed < UPLOAD_TIMEOUT_SECONDS, (
            f"Load test took {elapsed:.2f}s — exceeds {UPLOAD_TIMEOUT_SECONDS}s limit"
        )

    @pytest.mark.asyncio
    async def test_50_upload_metrics_report(self, client, seeded_data):
        """Measure and report min/avg/max latency for 50 concurrent uploads."""
        start = time.monotonic()
        responses = await _run_concurrent_uploads(client, CONCURRENCY_LEVEL)
        total_elapsed = time.monotonic() - start

        # All must succeed for a meaningful report
        assert all(r.status_code == 200 for r in responses), (
            "Not all uploads succeeded — cannot report meaningful metrics"
        )

        latencies = [r.elapsed.total_seconds() for r in responses]
        avg_latency = sum(latencies) / len(latencies)

        print(f"\n{'='*60}")
        print(f"  Manifesto Upload — Load Test Report ({CONCURRENCY_LEVEL} concurrent)")
        print(f"{'='*60}")
        print(f"  Total wall time:  {total_elapsed:.3f}s")
        print(f"  Requests/sec:     {CONCURRENCY_LEVEL / total_elapsed:.1f}")
        print(f"  Min latency:      {min(latencies):.4f}s")
        print(f"  Avg latency:      {avg_latency:.4f}s")
        print(f"  Max latency:      {max(latencies):.4f}s")
        print(f"  P50 latency:      {sorted(latencies)[len(latencies)//2]:.4f}s")
        print(f"  P95 latency:      {sorted(latencies)[int(len(latencies)*0.95)]:.4f}s")
        print(f"  P99 latency:      {sorted(latencies)[int(len(latencies)*0.99)]:.4f}s")
        print(f"  Success rate:     100% ({CONCURRENCY_LEVEL}/{CONCURRENCY_LEVEL})")
        print(f"{'='*60}\n")

        # Sanity: avg latency should be well under 5s for an in-memory mock
        assert avg_latency < 5.0, (
            f"Average latency {avg_latency:.4f}s is too high for in-memory mock"
        )

    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_150_stress_concurrent_uploads(self, client, seeded_data):
        """Stress test: 150 concurrent uploads → all succeed under 60s."""
        n = STRESS_CONCURRENCY
        start = time.monotonic()
        responses = await _run_concurrent_uploads(client, n)
        elapsed = time.monotonic() - start

        errors = [
            (i, r.status_code, r.text[:100])
            for i, r in enumerate(responses)
            if r.status_code != 200
        ]
        assert not errors, (
            f"{len(errors)}/{n} uploads failed:\n" +
            "\n".join(f"  #{i}: {s} — {t}" for i, s, t in errors[:5])
        )

        urls = set(r.json()["url"] for r in responses)
        assert len(urls) == n, (
            f"Expected {n} unique URLs, got {len(urls)}"
        )

        assert elapsed < 60.0, (
            f"Stress test took {elapsed:.2f}s — exceeds 60s limit"
        )

        print(f"\n  [STRESS] {n} concurrent uploads: {elapsed:.2f}s, "
              f"{n/elapsed:.0f} req/s")
'''

path = pathlib.Path("tests/backend/test_manifesto_load.py")
path.write_text(TEST_CONTENT, encoding="utf-8")
print(f"OK — wrote {path.stat().st_size} bytes to {path}")
