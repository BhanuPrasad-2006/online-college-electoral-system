import asyncio
import os
import json
import uuid
import base64
import hashlib
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch, MagicMock

try:
    import pytest
    import pytest_asyncio
except ImportError:
    class MockMark:
        def asyncio(self, func):
            return func
    class MockPytest:
        mark = MockMark()
        def fixture(self, *args, **kwargs):
            return lambda func: func
    pytest = MockPytest()
    pytest_asyncio = MockPytest()

from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select, delete

# Set up test database URL (sqlite+aiosqlite)
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

import sqlite3
sqlite3.register_adapter(uuid.UUID, str)

from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import INET, UUID as PostgresUUID

@compiles(INET, "sqlite")
def compile_inet_sqlite(element, compiler, **kw):
    return "VARCHAR(45)"

@compiles(PostgresUUID, "sqlite")
def compile_uuid_sqlite(element, compiler, **kw):
    return "VARCHAR(36)"

# Override ledger vault path to avoid modifying production files
import app.services.ledger_service as ledger_module
TEST_VAULT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_secure_vote_ledger.log")
ledger_module.VAULT_PATH = TEST_VAULT_PATH
ledger_module.VAULT_DIR = os.path.dirname(TEST_VAULT_PATH)

from app.main import app
from app.db.session import get_db
from app.db.base import Base as AppBase
from app.models.vote import Vote
from app.models.voter import Voter
from app.models.election import Election
from app.models.position import Position
from app.models.candidate import Candidate
from app.models.ai_alert import AIAlert
from app.models.audit_log import AuditLog
from app.enums.alert_type import AlertTypeEnum
from app.enums.alert_severity import AlertSeverityEnum
from app.api.deps import get_current_user, get_admin_user

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

app.dependency_overrides[get_db] = override_get_db

# Mock Auth Dependencies
MOCK_VOTER_ID = "00000000-0000-0000-0000-000000000001"
MOCK_ADMIN_EMAIL = "admin@test.edu"

async def mock_get_current_user():
    return {
        "user_id": uuid.UUID(MOCK_VOTER_ID),
        "email": MOCK_ADMIN_EMAIL,
        "role": "admin",
        "admin_role": "SUPER_ADMIN"
    }

async def mock_get_admin_user():
    return {"user_id": "admin-uuid", "email": MOCK_ADMIN_EMAIL, "role": "admin"}

app.dependency_overrides[get_current_user] = mock_get_current_user
app.dependency_overrides[get_admin_user] = mock_get_admin_user

# Disable rate limit for testing to prevent 429 errors from multiple sequential requests
from app.middleware.rate_limit import limiter
limiter.enabled = False

# Disable face verification for tests since they cast votes without face session tokens
from app.core.config import settings
settings.ENABLE_FACE_VERIFICATION = False



@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_db_fixture():
    # Remove test vault file if exists
    if os.path.exists(TEST_VAULT_PATH):
        try:
            os.remove(TEST_VAULT_PATH)
        except Exception:
            pass
            
    async with test_engine.begin() as conn:
        await conn.run_sync(AppBase.metadata.create_all)
        
    yield
    
    async with test_engine.begin() as conn:
        await conn.run_sync(AppBase.metadata.drop_all)
        
    if os.path.exists(TEST_VAULT_PATH):
        try:
            os.remove(TEST_VAULT_PATH)
        except Exception:
            pass


@pytest.fixture(autouse=True)
def mock_external_services():
    with patch("app.routes.vote.extract_face_embedding", return_value=[0.1]*128), \
         patch("app.routes.vote.compare_face_embeddings", return_value=True), \
         patch("app.routes.vote.deserialize_embedding", return_value=[0.1]*128), \
         patch("app.routes.vote.send_election_email", new_callable=AsyncMock):
        yield


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


async def seed_initial_data(session: AsyncSession):
    from app.security.password_service import hash_password
    from app.enums.candidate_status import CandidateStatusEnum
    
    # 1. Create a Voter (who casts the vote)
    voter = Voter(
        voter_id=uuid.UUID(MOCK_VOTER_ID),
        college_email="voter@test.edu",
        password_hash=hash_password("VoterPass@123"),
        full_name="Test Voter",
        student_id="STUDENT01",
        is_verified=True,
        vote_permission=True,
        verification_id=hash_password("12345678"),
        face_encoding="[0.1]*128"
    )
    session.add(voter)

    # 2. Create a Voter who will act as Candidate
    cand_voter = Voter(
        voter_id=uuid.UUID("44444444-4444-4444-4444-444444444444"),
        college_email="candidate@test.edu",
        password_hash=hash_password("CandPass@123"),
        full_name="Test Candidate",
        student_id="STUDENT02",
        is_verified=True,
        vote_permission=True,
        verification_id=hash_password("87654321"),
        face_encoding="[0.1]*128"
    )
    session.add(cand_voter)

    # 3. Create Election
    now = datetime.now(timezone.utc)
    election = Election(
        election_id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        title="Student Council Election 2026",
        description="Test Election",
        status="VOTING_OPEN",
        voting_start=now - timedelta(hours=1),
        voting_end=now + timedelta(hours=1),
        created_at=now
    )
    session.add(election)

    # 4. Create Position
    position = Position(
        position_id=uuid.UUID("22222222-2222-2222-2222-222222222222"),
        election_id=election.election_id,
        title="President"
    )
    session.add(position)

    # 5. Create Candidate
    candidate = Candidate(
        candidate_id=uuid.UUID("33333333-3333-3333-3333-333333333333"),
        voter_id=cand_voter.voter_id,
        election_id=election.election_id,
        position_id=position.position_id,
        mobile_number="9876543210",
        mobile_verified=True,
        status=CandidateStatusEnum.APPROVED.value
    )
    session.add(candidate)

    await session.commit()


async def get_anti_replay_token(client: AsyncClient, verification_id: str = "12345678") -> str:
    res = await client.post("/api/v1/vote/verify-id", json={"verification_id": verification_id})
    assert res.status_code == 200
    return res.json()["anti_replay_token"]


@pytest.mark.asyncio
async def test_valid_chain_creation(client: AsyncClient):
    # Seed the database
    async with TestSessionLocal() as session:
        await seed_initial_data(session)

    # 1. Cast first vote
    token1 = await get_anti_replay_token(client, "12345678")
    vote_payload = {
        "candidate_id": "33333333-3333-3333-3333-333333333333",
        "verification_id": "12345678",
        "live_face_image": "data:image/jpeg;base64," + base64.b64encode(b"dummyimage").decode("utf-8"),
        "anti_replay_token": token1
    }
    
    response = await client.post("/api/v1/vote/cast", json=vote_payload)
    assert response.status_code == 200
    assert response.json()["has_voted"] is True

    # 2. Inspect DB to verify ledger columns are set correctly
    async with TestSessionLocal() as session:
        result = await session.execute(select(Vote))
        votes = result.scalars().all()
        assert len(votes) == 1
        vote1 = votes[0]
        
        assert vote1.ledger_sequence == 1
        assert vote1.previous_hash is None or vote1.previous_hash == ""
        assert vote1.current_hash is not None
        assert len(vote1.current_hash) == 64
        
        # Verify vault contains the entry
        assert os.path.exists(TEST_VAULT_PATH)
        with open(TEST_VAULT_PATH, "r") as f:
            lines = f.readlines()
            assert len(lines) == 1
            vault_entry = json.loads(lines[0])
            assert vault_entry["sequence"] == 1
            assert vault_entry["hash"] == vote1.current_hash
            assert vault_entry["candidate_id"] == "33333333-3333-3333-3333-333333333333"

    # 3. Cast a second vote (reset has_voted for testing sequence chaining)
    async with TestSessionLocal() as session:
        voter = await session.get(Voter, uuid.UUID(MOCK_VOTER_ID))
        voter.has_voted = False
        await session.commit()

    token2 = await get_anti_replay_token(client, "12345678")
    vote_payload["anti_replay_token"] = token2
    response2 = await client.post("/api/v1/vote/cast", json=vote_payload)
    assert response2.status_code == 200

    async with TestSessionLocal() as session:
        result = await session.execute(select(Vote).order_by(Vote.ledger_sequence.asc()))
        votes = result.scalars().all()
        assert len(votes) == 2
        vote1, vote2 = votes[0], votes[1]
        
        assert vote2.ledger_sequence == 2
        assert vote2.previous_hash == vote1.current_hash
        assert vote2.current_hash is not None
        
        # Verify vault now contains two entries
        with open(TEST_VAULT_PATH, "r") as f:
            lines = f.readlines()
            assert len(lines) == 2
            entry2 = json.loads(lines[1])
            assert entry2["sequence"] == 2
            assert entry2["hash"] == vote2.current_hash
            assert entry2["candidate_id"] == "33333333-3333-3333-3333-333333333333"

    # 4. Verify ledger endpoints reporting valid
    response_verify = await client.get("/api/v1/admin/verify-ledger")
    assert response_verify.status_code == 200
    verify_res = response_verify.json()
    print("\n--- DEBUG verify_res ---")
    print(json.dumps(verify_res, indent=2))
    print("------------------------\n")
    assert verify_res["valid"] is True
    assert len(verify_res["tampered_entries"]) == 0
    assert len(verify_res["missing_entries"]) == 0
    assert len(verify_res["hash_mismatches"]) == 0


@pytest.mark.asyncio
async def test_tampered_db_detection(client: AsyncClient):
    async with TestSessionLocal() as session:
        await seed_initial_data(session)

    # Cast two votes
    token1 = await get_anti_replay_token(client, "12345678")
    vote_payload = {
        "candidate_id": "33333333-3333-3333-3333-333333333333",
        "verification_id": "12345678",
        "live_face_image": "data:image/jpeg;base64," + base64.b64encode(b"dummyimage").decode("utf-8"),
        "anti_replay_token": token1
    }
    
    await client.post("/api/v1/vote/cast", json=vote_payload)
    
    async with TestSessionLocal() as session:
        voter = await session.get(Voter, uuid.UUID(MOCK_VOTER_ID))
        voter.has_voted = False
        await session.commit()
        
    token2 = await get_anti_replay_token(client, "12345678")
    vote_payload["anti_replay_token"] = token2
    await client.post("/api/v1/vote/cast", json=vote_payload)

    # Directly tamper database row (e.g. modify candidate_id of sequence 2)
    async with TestSessionLocal() as session:
        result = await session.execute(select(Vote).where(Vote.ledger_sequence == 2))
        vote2 = result.scalar_one()
        vote2.candidate_id = "99999999-9999-9999-9999-999999999999" # Tamper!
        await session.commit()

    # Verify ledger integrity verification detects the tampering
    response_verify = await client.get("/api/v1/admin/verify-ledger")
    assert response_verify.status_code == 200
    verify_res = response_verify.json()
    
    assert verify_res["valid"] is False
    # Should flag a mismatch because candidate_id doesn't match vault, or current_hash mismatch
    assert len(verify_res["tampered_entries"]) > 0
    assert any("candidate_id" in entry["reason"] for entry in verify_res["tampered_entries"])


@pytest.mark.asyncio
async def test_deleted_row_detection(client: AsyncClient):
    async with TestSessionLocal() as session:
        await seed_initial_data(session)

    # Cast two votes
    token1 = await get_anti_replay_token(client, "12345678")
    vote_payload = {
        "candidate_id": "33333333-3333-3333-3333-333333333333",
        "verification_id": "12345678",
        "live_face_image": "data:image/jpeg;base64," + base64.b64encode(b"dummyimage").decode("utf-8"),
        "anti_replay_token": token1
    }
    await client.post("/api/v1/vote/cast", json=vote_payload)
    
    async with TestSessionLocal() as session:
        voter = await session.get(Voter, uuid.UUID(MOCK_VOTER_ID))
        voter.has_voted = False
        await session.commit()
        
    token2 = await get_anti_replay_token(client, "12345678")
    vote_payload["anti_replay_token"] = token2
    await client.post("/api/v1/vote/cast", json=vote_payload)

    # Delete sequence 2 vote from DB but keep in vault file
    async with TestSessionLocal() as session:
        await session.execute(delete(Vote).where(Vote.ledger_sequence == 2))
        await session.commit()

    # Verify ledger integrity verification detects the missing/deleted vote
    response_verify = await client.get("/api/v1/admin/verify-ledger")
    assert response_verify.status_code == 200
    verify_res = response_verify.json()
    
    assert verify_res["valid"] is False
    assert len(verify_res["missing_entries"]) == 1
    assert verify_res["missing_entries"][0]["sequence"] == 2
    assert "deleted" in verify_res["missing_entries"][0]["reason"]


@pytest.mark.asyncio
async def test_vault_consistency(client: AsyncClient):
    async with TestSessionLocal() as session:
        await seed_initial_data(session)

    # Cast a vote
    token1 = await get_anti_replay_token(client, "12345678")
    vote_payload = {
        "candidate_id": "33333333-3333-3333-3333-333333333333",
        "verification_id": "12345678",
        "live_face_image": "data:image/jpeg;base64," + base64.b64encode(b"dummyimage").decode("utf-8"),
        "anti_replay_token": token1
    }
    await client.post("/api/v1/vote/cast", json=vote_payload)

    # Modify vault file content to break consistency (change the candidate_id in vault)
    with open(TEST_VAULT_PATH, "r") as f:
        line = f.readline()
    data = json.loads(line)
    data["candidate_id"] = "44444444-4444-4444-4444-444444444444"
    with open(TEST_VAULT_PATH, "w") as f:
        f.write(json.dumps(data) + "\n")

    # Verify ledger integrity verification fails
    response_verify = await client.get("/api/v1/admin/verify-ledger")
    assert response_verify.status_code == 200
    verify_res = response_verify.json()
    
    assert verify_res["valid"] is False
    assert len(verify_res["tampered_entries"]) > 0


@pytest.mark.asyncio
async def test_honeypot_triggering(client: AsyncClient):
    async with TestSessionLocal() as session:
        await seed_initial_data(session)

    # Submit a vote triggering the honeypot (populate verification_field_confirm)
    token1 = await get_anti_replay_token(client, "12345678")
    vote_payload = {
        "candidate_id": "33333333-3333-3333-3333-333333333333",
        "verification_id": "12345678",
        "live_face_image": "data:image/jpeg;base64," + base64.b64encode(b"dummyimage").decode("utf-8"),
        "verification_field_confirm": "I am a bot",
        "anti_replay_token": token1
    }

    response = await client.post("/api/v1/vote/cast", json=vote_payload)
    assert response.status_code == 200

    # Verify that an AIAlert is generated in the DB
    async with TestSessionLocal() as session:
        result = await session.execute(select(AIAlert))
        alerts = result.scalars().all()
        assert len(alerts) == 1
        alert = alerts[0]
        assert alert.alert_type == AlertTypeEnum.BEHAVIORAL
        assert alert.severity == AlertSeverityEnum.HIGH
        assert "honeypot" in alert.description.lower()
        assert alert.is_resolved is False


@pytest.mark.asyncio
async def test_anomaly_alert_generation(client: AsyncClient):
    async with TestSessionLocal() as session:
        await seed_initial_data(session)
        
        # Seed 10 logs with IP 192.168.1.XX to trigger subnet concentration check
        # (Threshold is >= 10 in anomaly_service)
        for i in range(10):
            audit = AuditLog(
                log_id=uuid.uuid4(),
                actor_id=uuid.UUID(MOCK_VOTER_ID),
                ip_address=f"192.168.1.{i+10}",
                event_type="VOTE_CAST",
                description="Vote cast test",
                created_at=datetime.now(timezone.utc)
            )
            session.add(audit)
            
        # Seed robotic exact intervals: 6 votes spaced exactly 5 seconds apart
        base_time = datetime.now(timezone.utc)
        for i in range(6):
            vote = Vote(
                vote_id=str(uuid.uuid4()),
                voter_token_hash=hashlib.sha256(str(uuid.uuid4()).encode("utf-8")).hexdigest(),
                candidate_id="33333333-3333-3333-3333-333333333333",
                election_id="11111111-1111-1111-1111-111111111111",
                position_id="22222222-2222-2222-2222-222222222222",
                voted_at=base_time - timedelta(seconds=i * 5),
                ledger_sequence=100 + i,
                current_hash=hashlib.sha256(str(i).encode("utf-8")).hexdigest(),
                timestamp_utc=base_time - timedelta(seconds=i * 5)
            )
            session.add(vote)
            
        await session.commit()

    # Now let's cast a vote and verify it triggers alerts
    token1 = await get_anti_replay_token(client, "12345678")
    vote_payload = {
        "candidate_id": "33333333-3333-3333-3333-333333333333",
        "verification_id": "12345678",
        "live_face_image": "data:image/jpeg;base64," + base64.b64encode(b"dummyimage").decode("utf-8"),
        "anti_replay_token": token1
    }

    headers = {"x-forwarded-for": "192.168.1.100"}
    response = await client.post("/api/v1/vote/cast", json=vote_payload, headers=headers)
    assert response.status_code == 200

    # Check that AIAlerts are present in database
    async with TestSessionLocal() as session:
        result = await session.execute(select(AIAlert))
        alerts = result.scalars().all()
        assert len(alerts) > 0
        alert_types = [a.alert_type for a in alerts]
        assert AlertTypeEnum.IP_CLUSTERING in alert_types or AlertTypeEnum.BEHAVIORAL in alert_types


@pytest.mark.asyncio
async def test_admin_verification_and_resolution(client: AsyncClient):
    async with TestSessionLocal() as session:
        await seed_initial_data(session)
        alert = AIAlert(
            alert_id="alert-123",
            election_id="11111111-1111-1111-1111-111111111111",
            alert_type=AlertTypeEnum.BEHAVIORAL,
            severity=AlertSeverityEnum.MEDIUM,
            description="Robotic activity test",
            confidence_score=0.8,
            is_resolved=False
        )
        session.add(alert)
        await session.commit()

    # 1. Fetch alerts via admin endpoint
    response_alerts = await client.get("/api/v1/admin/ai-alerts")
    assert response_alerts.status_code == 200
    alerts = response_alerts.json()
    assert len(alerts) >= 1
    assert alerts[0]["alert_id"] == "alert-123"
    assert alerts[0]["is_resolved"] is False

    # 2. Resolve alert via PUT
    response_resolve = await client.put(f"/api/v1/admin/ai-alerts/alert-123/resolve")
    assert response_resolve.status_code == 200
    assert response_resolve.json()["message"] == "Alert resolved successfully"

    # 3. Verify resolved state in DB
    async with TestSessionLocal() as session:
        db_alert = await session.get(AIAlert, "alert-123")
        assert db_alert.is_resolved is True
        assert db_alert.resolved_by == MOCK_ADMIN_EMAIL


async def run_standalone_tests():
    print("==================================================")
    print("RUNNING STANDALONE SECURITY INTEGRATION TESTS...")
    print("==================================================")

    tests = [
        test_valid_chain_creation,
        test_tampered_db_detection,
        test_deleted_row_detection,
        test_vault_consistency,
        test_honeypot_triggering,
        test_anomaly_alert_generation,
        test_admin_verification_and_resolution
    ]

    passed_count = 0

    for test_func in tests:
        print(f"[*] Running {test_func.__name__}...")
        
        # Setup
        if os.path.exists(TEST_VAULT_PATH):
            try:
                os.remove(TEST_VAULT_PATH)
            except Exception:
                pass
                
        async with test_engine.begin() as conn:
            await conn.run_sync(AppBase.metadata.create_all)
            
        try:
            with patch("app.routes.vote.extract_face_embedding", return_value=[0.1]*128), \
                 patch("app.routes.vote.compare_face_embeddings", return_value=True), \
                 patch("app.routes.vote.deserialize_embedding", return_value=[0.1]*128), \
                 patch("app.routes.vote.send_election_email", new_callable=AsyncMock):
                 
                async with AsyncClient(
                    transport=ASGITransport(app=app),
                    base_url="http://test",
                ) as client:
                    await test_func(client)
            print(f"[+] {test_func.__name__} PASSED SUCCESS")
            passed_count += 1
        except Exception as e:
            print(f"[FAIL] {test_func.__name__} FAILED: {e}")
            import traceback
            traceback.print_exc()
        finally:
            # Teardown
            async with test_engine.begin() as conn:
                await conn.run_sync(AppBase.metadata.drop_all)
            if os.path.exists(TEST_VAULT_PATH):
                try:
                    os.remove(TEST_VAULT_PATH)
                except Exception:
                    pass
        print("-" * 50)

    print("==================================================")
    print(f"TEST RESULTS: {passed_count}/{len(tests)} PASSED")
    print("==================================================")
    if passed_count != len(tests):
        import sys
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(run_standalone_tests())
