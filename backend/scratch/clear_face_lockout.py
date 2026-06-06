"""Clear face verification lockout for a voter (DB + Redis)."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, func
from app.db.session import SessionLocal
from app.models.voter import Voter
from app.services.face_service import redis_face_lockout


async def main(email: str):
    async with SessionLocal() as db:
        res = await db.execute(
            select(Voter).where(func.lower(Voter.college_email) == email.strip().lower())
        )
        voter = res.scalar_one_or_none()
        if not voter:
            print("Voter not found")
            return
        voter.failed_face_attempts = 0
        voter.lockout_until = None
        await db.commit()
        await redis_face_lockout.clear_lockout(str(voter.voter_id))
        print(f"Cleared lockout for {voter.college_email} ({voter.voter_id})")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "1ds24cy015@dsce.edu.in"))
