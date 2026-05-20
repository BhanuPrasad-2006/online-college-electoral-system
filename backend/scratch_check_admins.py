import asyncio
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.admin_user import AdminUser

async def check_admins():
    async with SessionLocal() as db:
        query = select(AdminUser)
        res = await db.execute(query)
        admins = res.scalars().all()
        print(f"Total admins in database: {len(admins)}")
        for a in admins:
            print(f"ID: {a.admin_id}, Name: {a.full_name}, Email: {a.email}")

if __name__ == "__main__":
    asyncio.run(check_admins())
