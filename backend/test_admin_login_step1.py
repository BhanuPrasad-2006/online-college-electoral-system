import asyncio
import sys
from sqlalchemy.ext.asyncio import AsyncSession

sys.path.append(".")
from app.db.session import engine, SessionLocal
from app.services.auth_service import admin_login_step1

async def run_step1():
    print("--- Running admin_login_step1 in Test Mode ---")
    async with SessionLocal() as db:
        try:
            print("Invoking admin_login_step1...")
            result = await admin_login_step1(
                db=db,
                email="1ds24cy015@dsce.edu.in",
                mobile_number="7780184812",
                password="bhanu@2006"
            )
            print("SUCCESS! admin_login_step1 completed successfully!")
            print("Result:", result)
        except Exception as e:
            print("FAILED with Exception:", e)

if __name__ == "__main__":
    asyncio.run(run_step1())
