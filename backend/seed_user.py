import asyncio
import sys

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import engine
from app.models.voter import Voter
from app.security.password_service import hash_password

async def add_user(email: str, name: str, password: str, department: str, sem: int):
    async with AsyncSession(engine) as db:
        # Check if exists
        result = await db.execute(select(Voter).where(Voter.college_email == email))
        existing = result.scalars().first()
        
        if existing:
            print(f"User {email} already exists in DB. Updating password and details...")
            existing.full_name = name
            existing.password_hash = hash_password(password)
            existing.department = department
            existing.year_of_study = (sem + 1) // 2  # Approximate year from semester
            existing.is_verified = True
        else:
            print(f"Adding new user: {email}...")
            new_voter = Voter(
                full_name=name,
                college_email=email,
                password_hash=hash_password(password),
                department=department,
                year_of_study=(sem + 1) // 2,
                is_verified=True,
            )
            db.add(new_voter)
            
        await db.commit()
        print("Done!")

if __name__ == "__main__":
    if len(sys.argv) < 6:
        print("Usage: python seed_user.py <email> <name> <password> <department> <semester>")
        print("Example: python seed_user.py 1ds24cy015@dsce.edu.in \"Bhanu Prasad\" \"Password123!\" \"CSE\" 5")
        sys.exit(1)
        
    email = sys.argv[1]
    name = sys.argv[2]
    password = sys.argv[3]
    dept = sys.argv[4]
    sem = int(sys.argv[5])
    
    asyncio.run(add_user(email, name, password, dept, sem))
