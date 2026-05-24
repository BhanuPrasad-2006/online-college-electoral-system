import pathlib

content = """\"\"\"
Load test for the vote casting endpoint — 500+ concurrent vote submissions.

Tests:
  1. 50 concurrent unique voters -> all succeed (200 OK)
  2. All voters marked has_voted=True after test
  3. Ledger sequences unique and contiguous (integrity check)
  4. Performance metrics reported (min/avg/max/P50/P95/P99 latency)
  5. Stress: 500 concurrent voters (@pytest.mark.slow)
  6. Same-voter concurrency: row-level locking prevents double-voting

Run:  pytest tests/backend/test_vote_load.py -v --tb=short
      pytest tests/backend/test_vote_load.py -v -k stress --tb=short
\"\"\"

import uuid
import time
import asyncio
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import select
from datetime import datetime, timezone, timedelta

# Config
CONCURRENCY_LEVEL = 50
STRESS_CONCURRENCY = 500
LOAD_TIMEOUT_SECONDS = 60
SAME_VOTER_CONCURRENCY = 20

# In-memory SQLite
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


import app.db.session as db_module

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
from app.models.candidate import Candidate
from app.models.election import Election
from app.models.position import Position
from app.models.election_phase import ElectionPhase
from app.models.vote import Vote
from app.enums.election_status import ElectionStatusEnum
from app.enums.candidate_status import CandidateStatusEnum
from app.security.password_service import hash_password
from app.api.deps import get_current_user
from app.middleware.rate_limit import limiter

app.dependency_overrides[get_db] = override_get_db
limiter.enabled = False


_auth_queue: asyncio.Queue = None


async def mock_get_current_user_from_queue():
    return await _auth_queue.get()


ELECTION_ID = uuid.uuid4()
POSITION_ID = uuid.uuid4()
CANDIDATE_ID = uuid.uuid4()
CANDIDATE_VOTER_ID = uuid.uuid4()


@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_db():
    app.dependency_overrides[get_current_user] = mock_get_current_user_from_queue
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
    now = datetime.now(timezone.utc)

    election = Election(
        election_id=ELECTION_ID,
        title="Load Test Election 2026",
        description="Concurrency load testing election",
        status=ElectionStatusEnum.VOTING_OPEN.value,
        voting_start=now - timedelta(hours=1),
        voting_end=now + timedelta(hours=1),
    )
    db_session.add(election)

    position = Position(
        position_id=POSITION_ID,
        election_id=election.election_id,
        title="President",
    )
    db_session.add(position)

    cand_voter = Voter(
        voter_id=CANDIDATE_VOTER_ID,
        college_email="candidate@loadtest.edu",
        password_hash=hash_password("CandPass@123"),
        full_name="Candidate One",
        student_id="CAND001",
        department="CSE",
        year_of_study=3,
        is_verified=True,
        vote_permission=False,
        verification_id=hash_password("CAND0001"),
    )
    db_session.add(cand_voter)

    candidate = Candidate(
        candidate_id=CANDIDATE_ID,
        voter_id=CANDIDATE_VOTER_ID,
        election_id=election.election_id,
        position_id=position.position_id,
        mobile_number="9876543210",
        mobile_verified=True,
        status=CandidateStatusEnum.APPROVED.value,
    )
    db_session.add(candidate)

    phase = ElectionPhase(
        election_id=election.election_id,
        phase_name="Voting",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
        is_active=True,
    )
    db_session.add(phase)

    await db_session.commit()

    return {
        "election_id": str(election.election_id),
        "candidate_id": str(candidate.candidate_id),
    }


async def _seed_voters(db_session: AsyncSession, count: int):
    voters = []
    for i in range(count):
        voter_id = uuid.uuid4()
        voter = Voter(
            voter_id=voter_id,
            college_email=f"voter{i:04d}@loadtest.edu",
            password_hash=hash_password(f"VoterPass{i:04d}"),
            full_name=f"Load Test Voter {i:04d}",
            student_id=f"LOAD{i:04d}",
            department="CSE",
            year_of_study=3,
            is_verified=True,
            vote_permission=True,
            verification_id=hash_password("BYPASS"),
            has_voted=False,
        )
        db_session.add(voter)
        voters.append(voter)

    await db_session.commit()
    return voters


async def _run_concurrent_votes(
    client: AsyncClient,
    voters,
    candidate_id: str,
):
    global _auth_queue

    _auth_queue = asyncio.Queue()
    for v in voters:
        await _auth_queue.put({
            "user_id": v.voter_id,
            "email": v.college_email,
            "role": "voter",
        })

    with patch("app.routes.vote.AntiReplayService.validate_and_consume",
               new_callable=AsyncMock, return_value=True), \
         patch("app.routes.vote.FraudDetectionService.analyze_vote",
               new_callable=AsyncMock), \
         patch("app.routes.vote.append_to_secure_vault",
               new_callable=AsyncMock):

        tasks = [
            client.post(
                "/api/v1/vote/cast",
                json={
                    "candidate_id": candidate_id,
                    "verification_id": "BYPASS",
                    "anti_replay_token": f"load_test_token_{i:04d}",
                },
            )
            for i in range(len(voters))
        ]
        return await asyncio.gather(*tasks, return_exceptions=True)


async def _verify_voters_voted(db_session: AsyncSession, voters):
    for v in voters:
        result = await db_session.execute(
            select(Voter).where(Voter.voter_id == v.voter_id)
        )
        refreshed = result.scalar_one_or_none()
        assert refreshed is not None, f"Voter {v.voter_id} not found after test"
        assert refreshed.has_voted is True, (
            f"Voter {v.voter_id} ({v.full_name}) was NOT marked as voted"
        )


async def _verify_ledger_integrity(db_session: AsyncSession, expected_count: int):
    result = await db_session.execute(
        select(Vote).order_by(Vote.ledger_sequence.asc())
    )
    votes = result.scalars().all()

    assert len(votes) == expected_count, (
        f"Expected {expected_count} votes in DB, got {len(votes)}"
    )

    sequences = [v.ledger_sequence for v in votes if v.ledger_sequence is not None]
    assert len(sequences) == len(set(sequences)), (
        f"Duplicate ledger_sequences found! "
        f"Total votes: {
