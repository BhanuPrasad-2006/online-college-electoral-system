import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime, timezone, timedelta

# --- In-memory SQLite ---
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

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
from app.models.admin_user import AdminUser
from app.models.notice import Notice
from app.models.notice_recipient import NoticeRecipient
from app.models.admin_meeting import AdminMeeting
from app.models.meeting_participant import MeetingParticipant
from app.api.deps import get_current_user
from app.middleware.rate_limit import limiter

limiter.enabled = False

# --- Auth override (mutable -- switch per test) ---
_current_auth: dict = {}

async def mock_get_current_user():
    if not _current_auth:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Not authenticated")
    return _current_auth

@pytest.fixture
def anyio_backend():
    return "asyncio"

@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = mock_get_current_user
    # Create tables
    async with test_engine.begin() as conn:
        await conn.run_sync(AppBase.metadata.create_all)
    
    yield
    
    async with test_engine.begin() as conn:
        await conn.run_sync(AppBase.metadata.drop_all)
    app.dependency_overrides.clear()

@pytest.mark.anyio
async def test_admin_notices_rbac():
    # 1. Test unauthenticated request
    global _current_auth
    _current_auth = {}
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Notice creation requires SUPER_ADMIN
        response = await client.post("/api/v1/admin/notices", json={
            "title": "Election Schedule Update",
            "content": "The nomination window has been extended by 48 hours.",
            "priority": "HIGH",
            "role_target": "ALL"
        })
        assert response.status_code == 401
        
        # 2. Test authenticated but not Super Admin (e.g. Media Moderator / CANDIDATE_MODERATOR)
        _current_auth = {
            "user_id": str(uuid.uuid4()),
            "role": "admin",
            "email": "moderator@college.edu.in",
            "admin_role": "CANDIDATE_MODERATOR"
        }
        
        response = await client.post("/api/v1/admin/notices", json={
            "title": "Election Schedule Update",
            "content": "The nomination window has been extended by 48 hours.",
            "priority": "HIGH",
            "role_target": "ALL"
        })
        assert response.status_code == 403
        assert "Role unauthorized" in response.json()["detail"]

        # Seed super admin
        async with TestSessionLocal() as session:
            super_admin_id = uuid.uuid4()
            super_admin = AdminUser(
                admin_id=super_admin_id,
                full_name="Super Admin",
                email="admin@college.edu.in",
                password_hash="fakehash",
                role="SUPER_ADMIN"
            )
            session.add(super_admin)
            await session.commit()
            
        # 3. Test Super Admin creates notice successfully
        _current_auth = {
            "user_id": str(super_admin_id),
            "role": "admin",
            "email": "admin@college.edu.in",
            "admin_role": "SUPER_ADMIN"
        }
        
        response = await client.post("/api/v1/admin/notices", json={
            "title": "Election Schedule Update",
            "content": "The nomination window has been extended by 48 hours.",
            "priority": "HIGH",
            "role_target": "ALL"
        })
        assert response.status_code == 201
        res_data = response.json()
        assert res_data["success"] is True
        assert res_data["notice"]["title"] == "Election Schedule Update"
        notice_id = res_data["notice"]["notice_id"]
        
        # 4. Test list notices
        # Notices should be visible to any current voter/admin
        _current_auth = {
            "user_id": str(uuid.uuid4()),
            "role": "voter",
            "email": "voter@college.edu.in"
        }
        list_response = await client.get("/api/v1/admin/notices")
        assert list_response.status_code == 200
        assert len(list_response.json()) == 1
        assert list_response.json()[0]["title"] == "Election Schedule Update"
        
        # 5. Test download notice PDF
        pdf_response = await client.get(f"/api/v1/admin/notices/{notice_id}/pdf")
        assert pdf_response.status_code == 200
        assert pdf_response.headers["content-type"] == "application/pdf"
        assert len(pdf_response.content) > 0

@pytest.mark.anyio
async def test_admin_meetings_and_users():
    global _current_auth
    
    # Seed admins
    async with TestSessionLocal() as session:
        super_admin_id = uuid.uuid4()
        super_admin = AdminUser(
            admin_id=super_admin_id,
            full_name="Super Admin",
            email="admin@college.edu.in",
            password_hash="fakehash",
            role="SUPER_ADMIN"
        )
        manager_id = uuid.uuid4()
        manager = AdminUser(
            admin_id=manager_id,
            full_name="Manager Admin",
            email="manager@college.edu.in",
            password_hash="fakehash",
            role="ELECTION_MANAGER"
        )
        session.add_all([super_admin, manager])
        await session.commit()
        
    _current_auth = {
        "user_id": str(super_admin_id),
        "role": "admin",
        "email": "admin@college.edu.in",
        "admin_role": "SUPER_ADMIN"
    }
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create meeting (requires SUPER_ADMIN)
        response = await client.post("/api/v1/admin/meetings", json={
            "title": "Debrief and Verification",
            "agenda": "Review the biometric voter registration statistics and logs.",
            "meeting_time": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "participant_emails": ["manager@college.edu.in"]
        })
        assert response.status_code == 201
        res_data = response.json()
        assert res_data["success"] is True
        meeting_id = res_data["meeting"]["meeting_id"]
        
        # List meetings for manager admin
        _current_auth = {
            "user_id": str(manager_id),
            "role": "admin",
            "email": "manager@college.edu.in",
            "admin_role": "ELECTION_MANAGER"
        }
        list_res = await client.get("/api/v1/admin/meetings")
        assert list_res.status_code == 200
        assert len(list_res.json()) == 1
        assert list_res.json()[0]["title"] == "Debrief and Verification"
        
        # Mark attendance
        attend_res = await client.post(f"/api/v1/admin/meetings/{meeting_id}/attend")
        assert attend_res.status_code == 200
        assert attend_res.json()["success"] is True
        
        # List meetings again to verify attended is True
        list_res2 = await client.get("/api/v1/admin/meetings")
        assert list_res2.json()[0]["participants"][0]["attended"] is True

        # Test user management (SUPER_ADMIN only)
        _current_auth = {
            "user_id": str(super_admin_id),
            "role": "admin",
            "email": "admin@college.edu.in",
            "admin_role": "SUPER_ADMIN"
        }
        
        # List admin users
        users_res = await client.get("/api/v1/admin/users")
        assert users_res.status_code == 200
        assert len(users_res.json()) == 2
        
        # Create new admin
        new_adm_res = await client.post("/api/v1/admin/users", json={
            "full_name": "Test Moderator",
            "email": "mod@college.edu.in",
            "password": "Password123",
            "role": "CANDIDATE_MODERATOR"
        })
        assert new_adm_res.status_code == 201
        new_adm_id = new_adm_res.json()["user"]["admin_id"]
        
        # Delete admin
        del_res = await client.delete(f"/api/v1/admin/users/{new_adm_id}")
        assert del_res.status_code == 200
        assert del_res.json()["success"] is True
