"""Reset has_voted status for a voter and optionally clear all cast votes from the database."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, func, delete
from app.db.session import SessionLocal
from app.models.voter import Voter
from app.models.vote import Vote


async def main(email: str, clear_all_votes: bool = False):
    async with SessionLocal() as db:
        # 1. Reset voter has_voted status
        res = await db.execute(
            select(Voter).where(func.lower(Voter.college_email) == email.strip().lower())
        )
        voter = res.scalar_one_or_none()
        if not voter:
            print(f"[ERROR] Voter with email '{email}' not found")
        else:
            if not voter.has_voted:
                print(f"[INFO] Voter '{email}' has_voted status is already False")
            else:
                voter.has_voted = False
                print(f"[SUCCESS] Reset has_voted status to False for {voter.college_email} ({voter.voter_id})")

        # 2. Optionally clear all cast votes
        if clear_all_votes:
            # Delete all entries from votes table to reset stats
            vote_count_res = await db.execute(select(func.count(Vote.vote_id)))
            vote_count = vote_count_res.scalar() or 0
            
            if vote_count > 0:
                await db.execute(delete(Vote))
                print(f"[SUCCESS] Cleared all {vote_count} votes from the votes table to reset statistics")
            else:
                print("[INFO] Votes table is already empty")

        await db.commit()
        print("[SUCCESS] Database changes committed successfully!")


if __name__ == "__main__":
    email_arg = "1ds24cy015@dsce.edu.in"
    clear_votes_arg = False

    # Simple command line arguments parsing
    args = sys.argv[1:]
    if args:
        if "--clear-all-votes" in args:
            clear_votes_arg = True
            args.remove("--clear-all-votes")
        if args:
            email_arg = args[0]

    print(f"Running reset script with email: '{email_arg}', clear_all_votes: {clear_votes_arg}")
    asyncio.run(main(email_arg, clear_votes_arg))
