"""
E2E test for the full manifesto upload flow.

Tests:
  1. Upload a manifesto image file (mock Supabase returns public URL)
  2. Save manifesto text + image_url via PUT /me/manifesto
  3. Candidate sees own manifesto with image_url via GET /candidates/me
  4. Admin views all manifestos including image_url
  5. Admin approves manifesto
  6. Voter sees approved manifesto with image_url
  7. Voter does not see unapproved manifesto image_url

Run:  pytest tests/backend/test_manifesto_e2e.py -v --tb=short
"""

import uuid
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch
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


# --- App & Model imports ---
from app.main import app
from app.db.session import get_db
from app.db.base import Base as AppBase
from app.models.voter import Voter
from app.models.candidate import Candidate
from app.models.election import Election
from app.models.position import Position
from app.models.manifesto import Manifesto
from app.enums.election_status import ElectionStatusEnum
from app.enums.candidate_status import CandidateStatusEnum
from app.enums.manifesto_status import ManifestoStatusEnum
from app.security.password_service import hash_password
from app.api.deps import get_current_user, get_admin_user
from app.middleware.rate_limit import limiter
from app.services.supabase_storage import UploadedStorageObject

app.dependency_overrides[get_db] = override_get_db
limiter.enabled = False


# --- Test IDs ---
CANDIDATE_VOTER_ID = "00000000-0000-0000-0000-000000000001"
CANDIDATE_UUID = uuid.UUID(CANDIDATE_VOTER_ID)
CANDIDATE_ID = "33333333-3333-3333-3333-333333333333"
ELECTION_ID = "11111111-1111-1111-1111-111111111111"
POSITION_ID = "22222222-2222-2222-2222-222222222222"


# --- Auth override (mutable --- switch roles per test) ---
_current_auth: dict = {}

async def mock_get_current_user():
    return _current_auth

async def mock_get_admin_user():
    return {"user_id": "admin-uuid", "email": "admin@test.edu", "role": "admin"}

app.dependency_overrides[get_current_user] = mock_get_current_user
app.dependency_overrides[get_admin_user] = mock_get_admin_user


# --- Fixtures ---

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
    """
    Seed the minimum data needed for manifesto flow:
      - One approved candidate (with voter) in a VOTING_OPEN election
      - One voter (for visibility check)
    """
    # 1. Candidate voter
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

    # 2. Regular voter (to check visibility)
    voter2 = Voter(
        college_email="voter@test.edu",
        password_hash=hash_password("VoterPass@123"),
        full_name="Regular Voter",
        student_id="STUDENT02",
        department="ECE",
        year_of_study=2,
        is_verified=True,
        vote_permission=True,
        verification_id=hash_password("87654321"),
    )
    db_session.add(voter2)
    await db_session.flush()

    # 3. Election (VOTING_OPEN so candidates are visible)
    now = datetime.now(timezone.utc)
    election = Election(
        election_id=uuid.UUID(ELECTION_ID),
        title="Test Election 2026",
        description="E2E test election",
        status=ElectionStatusEnum.VOTING_OPEN.value,
        voting_start=now - timedelta(hours=1),
        voting_end=now + timedelta(hours=1),
        registration_start=now - timedelta(days=7),
        registration_end=now - timedelta(hours=2),
    )
    db_session.add(election)

    # 4. Position
    position = Position(
        position_id=uuid.UUID(POSITION_ID),
        election_id=election.election_id,
        title="President",
    )
    db_session.add(position)
    await db_session.flush()

    # 5. Candidate (APPROVED so they can submit manifesto)
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
        "election_id": ELECTION_ID,
        "position_id": POSITION_ID,
    }


# --- Tests ---

class TestManifestoUploadFlow:

    @pytest.mark.asyncio
    async def test_01_upload_image_file(self, client: AsyncClient, seeded_data: dict):
        """Upload a fake image returns a public URL from mock Supabase."""
        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "candidate@test.edu",
            "role": "candidate",
        })

        fake_url = "https://supabase.test/storage/v1/object/public/campaign-media/manifestos/test/image.png"

        with patch("app.routes.candidates.settings.SUPABASE_URL", "https://test.supabase.co"), \
             patch("app.routes.candidates.settings.SUPABASE_SERVICE_ROLE_KEY", "test-key"), \
             patch(
                 "app.routes.candidates.upload_manifesto_media",
                 new_callable=AsyncMock,
                 return_value=UploadedStorageObject(
                     path="manifestos/test/image.png",
                     public_url=fake_url,
                 ),
             ):
            response = await client.post(
                "/api/v1/candidates/me/manifesto/upload",
                files={"file": ("manifesto.png", b"fake-image-bytes", "image/png")},
            )

        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert data["url"] == fake_url
        assert "manifestos/test/" in data["path"]

    @pytest.mark.asyncio
    async def test_02_upload_rejects_invalid_extension(self, client: AsyncClient, seeded_data: dict):
        """Upload a .exe file -> 400."""
        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "candidate@test.edu",
            "role": "candidate",
        })

        response = await client.post(
            "/api/v1/candidates/me/manifesto/upload",
            files={"file": ("malware.exe", b"fake-exe", "application/x-msdownload")},
        )
        assert response.status_code == 400
        assert "extension" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_03_upload_rejects_oversized_file(self, client: AsyncClient, seeded_data: dict):
        """Upload a file > 10MB -> 400."""
        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "candidate@test.edu",
            "role": "candidate",
        })

        oversized = b"x" * (11 * 1024 * 1024)  # 11 MB
        response = await client.post(
            "/api/v1/candidates/me/manifesto/upload",
            files={"file": ("huge.pdf", oversized, "application/pdf")},
        )
        assert response.status_code == 400
        detail = response.json()["detail"].lower()
        assert "10mb" in detail or "exceeds" in detail

    @pytest.mark.asyncio
    async def test_04_save_manifesto_with_image_url(self, client: AsyncClient, seeded_data: dict):
        """Save manifesto text + image_url -> returns draft saved."""
        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "candidate@test.edu",
            "role": "candidate",
        })

        response = await client.put(
            "/api/v1/candidates/me/manifesto",
            json={
                "manifesto": "My campaign manifesto: better campus, better future.",
                "submit": False,
                "image_url": "https://supabase.test/storage/v1/object/public/campaign-media/manifestos/test/image.png",
            },
        )
        assert response.status_code == 200, f"Save failed: {response.text}"
        data = response.json()
        assert "draft" in data["manifesto_status"].lower()

    @pytest.mark.asyncio
    async def test_05_candidate_sees_own_manifesto_with_image(
        self, client: AsyncClient, seeded_data: dict,
    ):
        """GET /candidates/me returns manifesto content + image_url."""
        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "candidate@test.edu",
            "role": "candidate",
        })

        # First save a manifesto
        await client.put(
            "/api/v1/candidates/me/manifesto",
            json={
                "manifesto": "My campaign manifesto: better campus, better future.",
                "submit": False,
                "image_url": "https://supabase.test/storage/v1/object/public/campaign-media/manifestos/test/image.png",
            },
        )

        # Now fetch own profile
        response = await client.get("/api/v1/candidates/me")
        assert response.status_code == 200
        data = response.json()
        assert "manifesto" in data
        assert "better campus" in data["manifesto"]
        assert data["manifesto_image_url"] == (
            "https://supabase.test/storage/v1/object/public/campaign-media/manifestos/test/image.png"
        )

    @pytest.mark.asyncio
    async def test_06_admin_views_all_manifestos(
        self, client: AsyncClient, seeded_data: dict,
    ):
        """Admin GET /candidates/admin/manifestos returns all manifestos with image_url."""
        # First save a manifesto as candidate
        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "candidate@test.edu",
            "role": "candidate",
        })
        await client.put(
            "/api/v1/candidates/me/manifesto",
            json={
                "manifesto": "My campaign manifesto: better campus, better future.",
                "submit": True,
                "image_url": "https://supabase.test/storage/v1/object/public/campaign-media/manifestos/test/image.png",
            },
        )

        # List manifestos as admin (get_current_user has admin role from _current_auth)
        # But list_manifestos_for_admin uses get_admin_user which has its own override
        # so it won't be affected by _current_auth changes.
        response = await client.get("/api/v1/candidates/admin/manifestos")
        assert response.status_code == 200
        items = response.json()
        assert len(items) >= 1

        man = items[0]
        assert man["image_url"] == (
            "https://supabase.test/storage/v1/object/public/campaign-media/manifestos/test/image.png"
        )
        assert "better campus" in man["content"]
        assert man["candidate_status"] == "Approved"

    @pytest.mark.asyncio
    async def test_07_admin_approves_manifesto(self, client: AsyncClient, seeded_data: dict):
        """Admin approves -> manifesto status changes to approved."""
        # Save & submit manifesto as candidate
        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "candidate@test.edu",
            "role": "candidate",
        })
        save_resp = await client.put(
            "/api/v1/candidates/me/manifesto",
            json={
                "manifesto": "My campaign manifesto: better campus, better future.",
                "submit": True,
                "image_url": "https://supabase.test/storage/v1/object/public/campaign-media/manifestos/test/image.png",
            },
        )
        assert save_resp.status_code == 200

        # Fetch the manifesto ID from admin endpoint
        list_resp = await client.get("/api/v1/candidates/admin/manifestos")
        assert list_resp.status_code == 200
        items = list_resp.json()
        assert len(items) >= 1
        manifesto_id = items[0]["manifesto_id"]

        # Approve it
        approve_resp = await client.put(
            f"/api/v1/candidates/admin/manifestos/{manifesto_id}/review",
            json={"status": "approved", "admin_remarks": "Great manifesto!"},
        )
        assert approve_resp.status_code == 200
        assert approve_resp.json()["manifesto_status"] == "Approved"

    @pytest.mark.asyncio
    async def test_08_voter_sees_approved_manifesto_image(
        self, client: AsyncClient, seeded_data: dict,
    ):
        """Voter GET /candidates/ returns image_url for approved manifestos."""
        # Save & submit manifesto as candidate
        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "candidate@test.edu",
            "role": "candidate",
        })
        await client.put(
            "/api/v1/candidates/me/manifesto",
            json={
                "manifesto": "My campaign manifesto: better campus, better future.",
                "submit": True,
                "image_url": "https://supabase.test/storage/v1/object/public/campaign-media/manifestos/test/image.png",
            },
        )

        # Admin approves
        list_resp = await client.get("/api/v1/candidates/admin/manifestos")
        manifesto_id = list_resp.json()[0]["manifesto_id"]
        await client.put(
            f"/api/v1/candidates/admin/manifestos/{manifesto_id}/review",
            json={"status": "approved"},
        )

        # Voter fetches candidate list
        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "voter@test.edu",
            "role": "voter",
        })
        response = await client.get("/api/v1/candidates/")
        assert response.status_code == 200
        items = response.json()
        assert len(items) >= 1

        candidate_data = items[0]
        assert candidate_data["manifesto_image_url"] == (
            "https://supabase.test/storage/v1/object/public/campaign-media/manifestos/test/image.png"
        )
        assert "better campus" in candidate_data["manifesto"]

    @pytest.mark.asyncio
    async def test_09_voter_does_not_see_unapproved_manifesto_image(
        self, client: AsyncClient, seeded_data: dict,
    ):
        """Voter sees image_url=None for draft/pending manifestos."""
        # Save but do NOT submit (stays as DRAFT)
        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "candidate@test.edu",
            "role": "candidate",
        })
        await client.put(
            "/api/v1/candidates/me/manifesto",
            json={
                "manifesto": "This is draft content.",
                "submit": False,
                "image_url": "https://supabase.test/storage/v1/object/public/campaign-media/manifestos/test/draft.png",
            },
        )

        # Switch to voter
        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "voter@test.edu",
            "role": "voter",
        })
        response = await client.get("/api/v1/candidates/")
        assert response.status_code == 200
        items = response.json()
        if items:
            assert items[0]["manifesto_image_url"] is None
            assert items[0]["manifesto"] == ""

    @pytest.mark.asyncio
    async def test_10_upload_requires_candidate_auth(self, client: AsyncClient, seeded_data: dict):
        """Voter (not candidate) upload -> 403."""
        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "voter@test.edu",
            "role": "voter",
        })
        response = await client.post(
            "/api/v1/candidates/me/manifesto/upload",
            files={"file": ("test.png", b"fake", "image/png")},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_11_clear_image_url_on_update(
        self, client: AsyncClient, seeded_data: dict,
    ):
        """Save with image, then save without -> image_url is cleared."""
        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "candidate@test.edu",
            "role": "candidate",
        })

        # Save with image
        await client.put(
            "/api/v1/candidates/me/manifesto",
            json={
                "manifesto": "With image.",
                "submit": False,
                "image_url": "https://supabase.test/image.png",
            },
        )

        # Save without image (explicitly clear)
        await client.put(
            "/api/v1/candidates/me/manifesto",
            json={
                "manifesto": "Without image.",
                "submit": False,
                "image_url": "",
            },
        )

        # Verify image is cleared
        profile_resp = await client.get("/api/v1/candidates/me")
        assert profile_resp.status_code == 200
        assert profile_resp.json()["manifesto_image_url"] is None
