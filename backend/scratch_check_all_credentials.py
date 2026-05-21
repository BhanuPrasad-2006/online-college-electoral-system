import asyncio
import sys
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

sys.path.append(".")
from app.db.session import engine
from app.models.voter import Voter
from app.models.admin_user import AdminUser
from app.security.password_service import verify_password

async def test_credentials():
    email = "1ds24cy015@dsce.edu.in"
    passwords = ["bhanu@2006", "Bhanu@2006", "bhanu@cy015", "Bhanu@cy015", "Bhanu@cy015!"]
    
    async with AsyncSession(engine) as db:
        # Check Voter
        print("--- VOTER CHECK ---")
        result = await db.execute(select(Voter).where(Voter.college_email == email))
        voter = result.scalars().first()
        if voter:
            print(f"Voter found. Name: {voter.full_name}, Hash: {voter.password_hash}")
            matched = False
            for p in passwords:
                if verify_password(p, voter.password_hash):
                    print(f"  -> MATCHED: '{p}' is correct!")
                    matched = True
                    break
            if not matched:
                print("  -> ERROR: No match in passwords list.")
        else:
            print("Voter not found.")
            
        # Check AdminUser
        print("\n--- ADMIN CHECK ---")
        result = await db.execute(select(AdminUser).where(AdminUser.email == email))
        admin = result.scalars().first()
        if admin:
            print(f"Admin found. Name: {admin.full_name}, Hash: {admin.password_hash}")
            matched = False
            for p in passwords:
                if verify_password(p, admin.password_hash):
                    print(f"  -> MATCHED: '{p}' is correct!")
                    matched = True
                    break
            if not matched:
                print("  -> ERROR: No match in passwords list.")
        else:
            print("Admin not found.")

if __name__ == "__main__":
    asyncio.run(test_credentials())
