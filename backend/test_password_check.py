import asyncio
import sys
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

sys.path.append(".")
from app.db.session import engine
from app.models.admin_user import AdminUser
from app.security.password_service import verify_password

async def verify_stored_password():
    async with AsyncSession(engine) as db:
        result = await db.execute(
            select(AdminUser).where(AdminUser.email == "1ds24cy015@dsce.edu.in")
        )
        admin = result.scalars().first()
        if not admin:
            print("Admin user not found!")
            return
            
        print("Admin user found! Hash in DB:", admin.password_hash)
        
        passwords_to_test = ["bhanu@2006", "Bhanu@2006", "Bhanu@cy015", "Bhanu@cy015!", "bhanu@cy015"]
        for p in passwords_to_test:
            if verify_password(p, admin.password_hash):
                print(f"SUCCESS MATCH FOUND! Correct Password is: '{p}'")
                return
        print("FAIL No matching password found in the test list.")

if __name__ == "__main__":
    asyncio.run(verify_stored_password())
