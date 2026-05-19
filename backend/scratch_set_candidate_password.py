import asyncio
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.voter import Voter
from app.security.password_service import hash_password

async def main():
    async with SessionLocal() as db:
        result = await db.execute(select(Voter).where(Voter.college_email == "1ds24cy021@dsce.edu.in"))
        v = result.scalars().first()
        if v:
            v.password_hash = hash_password("bhanu@2006")
            await db.commit()
            print("Successfully set Mahadev's password to 'bhanu@2006'!")
        else:
            print("Voter not found!")

if __name__ == "__main__":
    asyncio.run(main())
