import asyncio
import sys
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Import our configurations
sys.path.append(".")
from app.core.config import settings
from app.models.admin_user import AdminUser
from app.db.session import engine

from sqlalchemy import text

async def test_diagnostics():
    print("--- 1. Testing Database Connectivity ---")
    try:
        async with engine.begin() as conn:
            # Try a simple quick execution
            res = await conn.execute(text("SELECT 1"))
            print("Database connectivity verified! Result:", res.fetchone())

    except Exception as e:
        print("DATABASE CONNECTIVITY FAILED:", e)
        return

    print("\n--- 2. Querying Admin User Table ---")
    SessionLocal = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    email_to_test = "1ds24cy015@dsce.edu.in"
    print(f"Searching for admin user with email: {email_to_test}")
    
    async with SessionLocal() as db:
        try:
            result = await db.execute(
                select(AdminUser).where(AdminUser.email == email_to_test)
            )
            admin = result.scalars().first()
            if admin:
                print("SUCCESS: Found admin user record!")
                print(f"Admin ID: {admin.admin_id}")
                print(f"Name: {admin.full_name}")
                print(f"Email: {admin.email}")
            else:
                print(f"WARNING: No admin user found in database with email '{email_to_test}'.")
                print("Checking all registered admins in table:")
                all_admins_res = await db.execute(select(AdminUser))
                all_admins = all_admins_res.scalars().all()
                if all_admins:
                    for a in all_admins:
                        print(f" - {a.full_name} ({a.email})")
                else:
                    print("No records exist in the admin_users table!")
        except Exception as e:
            print("QUERY FAILED:", e)

if __name__ == "__main__":
    asyncio.run(test_diagnostics())
