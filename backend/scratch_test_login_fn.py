import asyncio
import sys
import traceback
from sqlalchemy.ext.asyncio import AsyncSession

sys.path.append(".")
from app.db.session import engine
from app.services.auth_service import voter_login_step1, candidate_login_step1

async def test_auth():
    email = "1ds24cy015@dsce.edu.in"
    password = "bhanu@2006"
    mobile = "7780184812"
    
    async with AsyncSession(engine) as db:
        print("Testing Voter Login Step 1:")
        try:
            res = await voter_login_step1(db, email, password)
            print("  Voter Login Step 1: SUCCESS!")
            print("  Result:", res)
        except Exception as e:
            print("  Voter Login Step 1: FAILED!")
            traceback.print_exc()
            
        print("\nTesting Candidate Login Step 1:")
        try:
            res = await candidate_login_step1(db, email, mobile, password)
            print("  Candidate Login Step 1: SUCCESS!")
            print("  Result:", res)
        except Exception as e:
            print("  Candidate Login Step 1: FAILED!")
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_auth())
