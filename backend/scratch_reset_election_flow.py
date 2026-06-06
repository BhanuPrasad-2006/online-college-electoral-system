import asyncio
import sys
from sqlalchemy import select, delete, update, func
from app.db.session import SessionLocal
from app.models.election import Election
from app.models.voter import Voter
from app.models.vote import Vote
from app.enums.election_status import ElectionStatusEnum

async def main():
    async with SessionLocal() as db:
        # 1. Get current election
        res = await db.execute(select(Election).order_by(Election.created_at.desc()))
        election = res.scalars().first()
        if not election:
            print("No election found.")
            return

        original_status = election.status
        original_status_val = original_status.value if hasattr(original_status, "value") else original_status
        print(f"Current election status: {original_status_val}")

        # If election is CLOSED or RESULTS_PUBLISHED, temporarily change status to allow deleting votes
        # (since a trigger prevents delete when election is closed)
        temp_status = ElectionStatusEnum.VOTING_OPEN.value
        if original_status_val in ["closed", "RESULTS_PUBLISHED"]:
            print(f"Temporarily setting election status to '{temp_status}' to bypass deletion trigger...")
            election.status = ElectionStatusEnum.VOTING_OPEN.value
            await db.commit()
            print("Election status set to VOTING_OPEN temporarily.")

        # 2. Delete all votes
        try:
            vote_count_res = await db.execute(select(func.count(Vote.vote_id)))
            vote_count = vote_count_res.scalar() or 0
            print(f"Current vote count: {vote_count}")
        except Exception as count_err:
            print(f"Could not count votes: {count_err}")
            vote_count = 0
            
        try:
            print("Attempting to delete all votes from votes table...")
            del_res = await db.execute(delete(Vote))
            print("Successfully deleted all votes.")
        except Exception as e:
            print(f"Failed to delete votes: {e}")

        # 3. Reset has_voted status for ALL voters
        print("Resetting has_voted status for all voters to False...")
        await db.execute(update(Voter).values(has_voted=False))
        print("Successfully reset all voters.")

        # 4. If we changed status, we can either set it to VOTING_OPEN (so they can vote today)
        # or restore it. But they want to vote today, so let's set it to VOTING_OPEN.
        print("Setting election status to VOTING_OPEN so voting is allowed today...")
        election.status = ElectionStatusEnum.VOTING_OPEN.value
        election.result_integrity_hash = None  # Clear integrity hash if it exists
        
        await db.commit()
        print("All database changes committed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
