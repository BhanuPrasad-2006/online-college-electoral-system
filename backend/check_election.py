import asyncio
from app.db.session import SessionLocal
from app.models.election import Election
from sqlalchemy import select

async def main():
    async with SessionLocal() as db:
        res = await db.execute(select(Election).order_by(Election.created_at.desc()))
        e = res.scalars().first()
        if e:
            print("ID:", e.election_id)
            print("Status:", e.status)
            print("RegStart:", e.registration_start)
            print("RegEnd:", e.registration_end)
            print("Current Status Value:", e.status.value if hasattr(e.status, "value") else e.status)
        else:
            print("No election found.")

if __name__ == "__main__":
    asyncio.run(main())
