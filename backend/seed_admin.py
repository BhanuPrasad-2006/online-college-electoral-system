import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import sys

from app.db.session import engine
from app.models.admin_user import AdminUser
from app.security.password_service import hash_password

async def seed_all_admins(db: AsyncSession):
    """Seed all 4 specific admin roles if they do not exist, or update their credentials."""
    admins_to_seed = [
        {
            "email": "admin@college.edu.in",
            "full_name": "Election Commissioner (Super Admin)",
            "password": "bhanu@2006",
            "role": "SUPER_ADMIN"
        },
        {
            "email": "yatishb1980@gmail.com",
            "full_name": "Yatish B (Election Manager)",
            "password": "Yatish@1122",
            "role": "ELECTION_MANAGER"
        },
        {
            "email": "1ds24cy035@dsce.edu.in",
            "full_name": "Sampada (Candidate Moderator)",
            "password": "Sampada@123",
            "role": "CANDIDATE_MODERATOR"
        },
        {
            "email": "1ds24cy014@dsce.edu.in",
            "full_name": "Disha (Security Admin)",
            "password": "Disha@014",
            "role": "AUDIT_SECURITY_ADMIN"
        }
    ]

    for item in admins_to_seed:
        result = await db.execute(select(AdminUser).where(AdminUser.email == item["email"]))
        existing = result.scalars().first()
        
        if existing:
            print(f"Admin {item['email']} already exists. Updating details...")
            existing.full_name = item["full_name"]
            existing.password_hash = hash_password(item["password"])
            existing.role = item["role"]
        else:
            print(f"Creating Admin {item['email']} with role {item['role']}...")
            new_admin = AdminUser(
                full_name=item["full_name"],
                email=item["email"],
                password_hash=hash_password(item["password"]),
                role=item["role"]
            )
            db.add(new_admin)
            
    await db.commit()
    print("✅ All admins seeded successfully!")

async def main():
    async with AsyncSession(engine) as db:
        await seed_all_admins(db)

if __name__ == "__main__":
    asyncio.run(main())
