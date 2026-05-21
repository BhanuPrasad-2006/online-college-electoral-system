import asyncio
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.voter import Voter
from app.models.admin_user import AdminUser
from app.models.candidate import Candidate
from app.security.password_service import verify_password

async def main():
    async with SessionLocal() as db:
        print("--- ALL VOTERS ---")
        v_res = await db.execute(select(Voter))
        voters = v_res.scalars().all()
        for v in voters:
            print(f"Name: {v.full_name}")
            print(f"  Email: {v.college_email}")
            print(f"  Is Verified: {v.is_verified}")
            print(f"  Vote Permission: {v.vote_permission}")
            print(f"  Has Voted: {v.has_voted}")
            print(f"  Mobile: {v.mobile_number}")
            print(f"  Verification ID: {v.verification_id}")
            
        print("\n--- ALL CANDIDATES ---")
        c_res = await db.execute(select(Candidate))
        candidates = c_res.scalars().all()
        for c in candidates:
            print(f"Candidate ID: {c.candidate_id}")
            print(f"  Voter ID: {c.voter_id}")
            print(f"  Mobile: {c.mobile_number}")
            print(f"  Status: {c.status}")
            
        print("\n--- ALL ADMINS ---")
        a_res = await db.execute(select(AdminUser))
        admins = a_res.scalars().all()
        for a in admins:
            print(f"Name: {a.full_name}")
            print(f"  Email: {a.email}")

if __name__ == "__main__":
    asyncio.run(main())
