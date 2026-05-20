"""
Auth Login Tests
Run: pytest tests/test_auth.py -v

Uses in-memory SQLite (via aiosqlite) — no real DB, email, or SMS needed.
All external services are mocked.
"""
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

# ─── Use in-memory SQLite for tests ───────────────────────────────────────────
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


class Base(DeclarativeBase):
    pass


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


# ─── App & Model imports ───────────────────────────────────────────────────────
from app.main import app
from app.db.session import get_db, Base as AppBase
from app.models.voter import Voter
from app.models.candidate import Candidate
from app.models.otp_request import OTPRequest
from app.security.password import hash_password

app.dependency_overrides[get_db] = override_get_db


# ─── Fixtures ─────────────────────────────────────────────────────────────────

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
async def test_voter(db_session: AsyncSession):
    """Pre-created voter in DB."""
    voter = Voter(
        email="voter@test.edu",
        hashed_password=hash_password("TestPass@123"),
        full_name="Test Voter",
        roll_number="CS001",
        is_active=True,
        is_verified=True,
    )
    db_session.add(voter)
    await db_session.commit()
    await db_session.refresh(voter)
    return voter


@pytest_asyncio.fixture
async def test_candidate(db_session: AsyncSession):
    """Pre-created candidate in DB."""
    candidate = Candidate(
        email="candidate@test.edu",
        mobile_number="9876543210",
        hashed_password=hash_password("TestPass@123"),
        full_name="Test Candidate",
        roll_number="CS002",
        is_active=True,
        is_email_verified=False,
        is_mobile_verified=False,
    )
    db_session.add(candidate)
    await db_session.commit()
    await db_session.refresh(candidate)
    return candidate


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


# ─── Helpers ──────────────────────────────────────────────────────────────────

def mock_email_success():
    return patch("app.services.auth.send_otp_email", new_callable=AsyncMock, return_value=True)

def mock_sms_success():
    return patch("app.services.auth.send_otp_sms", new_callable=AsyncMock, return_value=True)

def mock_email_fail():
    return patch("app.services.auth.send_otp_email", new_callable=AsyncMock, return_value=False)


# ─── Health Check ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


# ─── Voter Login Tests ────────────────────────────────────────────────────────

class TestVoterLogin:

    @pytest.mark.asyncio
    async def test_step1_success(self, client: AsyncClient, test_voter):
        """Valid credentials → OTP sent → session token returned."""
        with mock_email_success():
            response = await client.post("/api/v1/auth/voter/login", json={
                "email": "voter@test.edu",
                "password": "TestPass@123",
            })
        assert response.status_code == 200
        data = response.json()
        assert "otp_session_token" in data
        assert data["message"] == "OTP sent to your registered email address."
        assert "vo***" in data["hint"]  # masked email hint

    @pytest.mark.asyncio
    async def test_step1_wrong_password(self, client: AsyncClient, test_voter):
        """Wrong password → 401."""
        response = await client.post("/api/v1/auth/voter/login", json={
            "email": "voter@test.edu",
            "password": "WrongPassword",
        })
        assert response.status_code == 401
        assert "Invalid" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_step1_nonexistent_email(self, client: AsyncClient):
        """Unknown email → 401 (same error, no user enumeration)."""
        response = await client.post("/api/v1/auth/voter/login", json={
            "email": "nobody@test.edu",
            "password": "TestPass@123",
        })
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_step1_disabled_account(self, client: AsyncClient, db_session: AsyncSession):
        """Disabled voter → 403."""
        voter = Voter(
            email="disabled@test.edu",
            hashed_password=hash_password("TestPass@123"),
            full_name="Disabled Voter",
            is_active=False,
        )
        db_session.add(voter)
        await db_session.commit()

        response = await client.post("/api/v1/auth/voter/login", json={
            "email": "disabled@test.edu",
            "password": "TestPass@123",
        })
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_step2_success_full_flow(self, client: AsyncClient, test_voter, db_session: AsyncSession):
        """Full voter login: step1 + step2 → JWT issued."""
        captured_otp = {}

        async def capture_otp(*args, **kwargs):
            # Intercept the OTP creation to capture the plain OTP
            return True

        with mock_email_success():
            r1 = await client.post("/api/v1/auth/voter/login", json={
                "email": "voter@test.edu",
                "password": "TestPass@123",
            })
        assert r1.status_code == 200
        session_token = r1.json()["otp_session_token"]

        # Fetch OTP hash from DB and retrieve plain OTP by querying
        from sqlalchemy import select
        from app.models.otp_request import OTPRequest as OTPModel
        from app.enums.roles import OTPType, OTPPurpose

        result = await db_session.execute(
            select(OTPModel).where(
                OTPModel.user_id == test_voter.id,
                OTPModel.otp_type == OTPType.EMAIL,
                OTPModel.is_used == False,
            )
        )
        otp_record = result.scalars().first()
        assert otp_record is not None

        # Since OTP is hashed, we verify by submitting the right OTP from a
        # known-good context. Here we patch verify_otp to return True.
        with patch("app.services.auth.verify_otp", new_callable=AsyncMock) as mock_verify:
            mock_verify.return_value = (True, "OTP verified successfully.")
            r2 = await client.post("/api/v1/auth/voter/verify-otp", json={
                "otp_session_token": session_token,
                "otp": "123456",
            })

        assert r2.status_code == 200
        data = r2.json()
        assert "access_token" in data
        assert data["role"] == "voter"
        assert data["full_name"] == "Test Voter"

    @pytest.mark.asyncio
    async def test_step2_wrong_otp(self, client: AsyncClient, test_voter):
        """Wrong OTP → 400."""
        with mock_email_success():
            r1 = await client.post("/api/v1/auth/voter/login", json={
                "email": "voter@test.edu",
                "password": "TestPass@123",
            })
        session_token = r1.json()["otp_session_token"]

        r2 = await client.post("/api/v1/auth/voter/verify-otp", json={
            "otp_session_token": session_token,
            "otp": "000000",  # definitely wrong
        })
        assert r2.status_code == 400

    @pytest.mark.asyncio
    async def test_step2_expired_session_token(self, client: AsyncClient):
        """Expired session token → 401."""
        r2 = await client.post("/api/v1/auth/voter/verify-otp", json={
            "otp_session_token": "this.is.invalid",
            "otp": "123456",
        })
        assert r2.status_code == 401

    @pytest.mark.asyncio
    async def test_step2_invalid_otp_format(self, client: AsyncClient, test_voter):
        """Non-numeric or wrong-length OTP → 422 validation error."""
        with mock_email_success():
            r1 = await client.post("/api/v1/auth/voter/login", json={
                "email": "voter@test.edu",
                "password": "TestPass@123",
            })
        session_token = r1.json()["otp_session_token"]

        r2 = await client.post("/api/v1/auth/voter/verify-otp", json={
            "otp_session_token": session_token,
            "otp": "ABCDEF",  # not digits
        })
        assert r2.status_code == 422


# ─── Candidate Login Tests ────────────────────────────────────────────────────

class TestCandidateLogin:

    @pytest.mark.asyncio
    async def test_step1_success(self, client: AsyncClient, test_candidate):
        """Valid credentials → OTP sent to email + SMS."""
        with mock_email_success(), mock_sms_success():
            response = await client.post("/api/v1/auth/candidate/login", json={
                "email": "candidate@test.edu",
                "mobile_number": "9876543210",
                "password": "TestPass@123",
            })
        assert response.status_code == 200
        data = response.json()
        assert "otp_session_token" in data
        assert "email" in data["hint"].lower() or "otp" in data["message"].lower()

    @pytest.mark.asyncio
    async def test_step1_wrong_mobile(self, client: AsyncClient, test_candidate):
        """Correct email+pass but wrong mobile → 401."""
        with mock_email_success(), mock_sms_success():
            response = await client.post("/api/v1/auth/candidate/login", json={
                "email": "candidate@test.edu",
                "mobile_number": "9999999999",  # wrong
                "password": "TestPass@123",
            })
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_step1_invalid_mobile_format(self, client: AsyncClient, test_candidate):
        """Invalid mobile format → 422."""
        response = await client.post("/api/v1/auth/candidate/login", json={
            "email": "candidate@test.edu",
            "mobile_number": "12345",  # too short
            "password": "TestPass@123",
        })
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_step1_wrong_password(self, client: AsyncClient, test_candidate):
        """Wrong password → 401."""
        response = await client.post("/api/v1/auth/candidate/login", json={
            "email": "candidate@test.edu",
            "mobile_number": "9876543210",
            "password": "WrongPass",
        })
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_step2_success(self, client: AsyncClient, test_candidate):
        """Both OTPs correct → JWT issued."""
        with mock_email_success(), mock_sms_success():
            r1 = await client.post("/api/v1/auth/candidate/login", json={
                "email": "candidate@test.edu",
                "mobile_number": "9876543210",
                "password": "TestPass@123",
            })
        assert r1.status_code == 200
        session_token = r1.json()["otp_session_token"]

        with patch("app.services.auth.verify_otp", new_callable=AsyncMock) as mock_verify:
            mock_verify.return_value = (True, "OTP verified successfully.")
            r2 = await client.post("/api/v1/auth/candidate/verify-otp", json={
                "otp_session_token": session_token,
                "email_otp": "123456",
                "sms_otp": "654321",
            })

        assert r2.status_code == 200
        data = r2.json()
        assert data["role"] == "candidate"
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_step2_wrong_sms_otp(self, client: AsyncClient, test_candidate):
        """Wrong SMS OTP (email correct) → 400."""
        with mock_email_success(), mock_sms_success():
            r1 = await client.post("/api/v1/auth/candidate/login", json={
                "email": "candidate@test.edu",
                "mobile_number": "9876543210",
                "password": "TestPass@123",
            })
        session_token = r1.json()["otp_session_token"]

        # Email OTP passes, SMS fails
        call_count = 0
        async def side_effect_verify(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return (True, "OK")   # email
            return (False, "Invalid OTP")  # sms

        with patch("app.services.auth.verify_otp", side_effect=side_effect_verify):
            r2 = await client.post("/api/v1/auth/candidate/verify-otp", json={
                "otp_session_token": session_token,
                "email_otp": "123456",
                "sms_otp": "000000",
            })
        assert r2.status_code == 400
        assert "SMS OTP" in r2.json()["detail"]

    @pytest.mark.asyncio
    async def test_voter_token_rejected_for_candidate_otp(self, client: AsyncClient, test_voter, test_candidate):
        """Session token from voter flow cannot be used in candidate verify."""
        with mock_email_success():
            r1 = await client.post("/api/v1/auth/voter/login", json={
                "email": "voter@test.edu",
                "password": "TestPass@123",
            })
        voter_token = r1.json()["otp_session_token"]

        r2 = await client.post("/api/v1/auth/candidate/verify-otp", json={
            "otp_session_token": voter_token,  # voter token used here
            "email_otp": "123456",
            "sms_otp": "654321",
        })
        assert r2.status_code == 401  # role mismatch