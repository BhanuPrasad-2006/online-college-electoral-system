import asyncio
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.voter import Voter

async def main():
    async with SessionLocal() as db:
        query = select(Voter).where(Voter.college_email == "1ds24cy038@dsce.edu.in")
        res = await db.execute(query)
        v = res.scalars().first()
        if v:
            print("ID:", v.voter_id)
            print("Name:", v.full_name)
            print("Email:", v.college_email)
            print("Year of study:", v.year_of_study)
            print("Department:", v.department)
            print("Is Verified:", v.is_verified)
            print("Vote Permission:", v.vote_permission)
            print("Has Voted:", v.has_voted)
            print("Verification ID:", v.verification_id)
        else:
            print("Voter not found!")

if __name__ == "__main__":
    asyncio.run(main())
