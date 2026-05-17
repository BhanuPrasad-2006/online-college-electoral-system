import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import sys

from app.db.session import engine
from app.models.admin_user import AdminUser
from app.security.password_service import hash_password

async def add_admin(email: str, name: str, password: str):
    async with AsyncSession(engine) as db:
        # Check if exists
        result = await db.execute(select(AdminUser).where(AdminUser.email == email))
        existing = result.scalars().first()
        
        if existing:
            print(f"Admin {email} already exists in DB. Updating details...")
            existing.full_name = name
            existing.password_hash = hash_password(password)
        else:
            print(f"Adding new Admin: {email}...")
            new_admin = AdminUser(
                full_name=name,
                email=email,
                password_hash=hash_password(password),
            )
            db.add(new_admin)
            
        await db.commit()
        print("✅ Admin seeded successfully!")

if __name__ == "__main__":
    email = "admin@college.edu.in"
    name = "Election Commissioner"
    password = "bhanu@2006"  # Using the same test password for ease of use
    
    asyncio.run(add_admin(email, name, password))
