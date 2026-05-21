import asyncio
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.voter import Voter

async def main():
    async with SessionLocal() as db:
        query = select(Voter).where(Voter.college_email == "1ds24cy015@dsce.edu.in")
        res = await db.execute(query)
        v = res.scalars().first()
        if v:
            print(f"Found voter: {v.full_name}")
            if "Eligible" in v.full_name:
                v.full_name = "Bhanu Prasad"
                await db.commit()
                print("Voter name updated successfully to 'Bhanu Prasad'!")
            else:
                print("No update needed.")
        else:
            print("Voter not found!")

if __name__ == "__main__":
    asyncio.run(main())
