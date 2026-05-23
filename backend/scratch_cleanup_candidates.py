import asyncio
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.candidate import Candidate
from app.utils.logger import logger

async def cleanup_duplicates():
    async with SessionLocal() as db:
        # Fetch all candidates
        res = await db.execute(select(Candidate).order_by(Candidate.applied_at.asc()))
        candidates = res.scalars().all()
        
        seen_voter_ids = set()
        duplicates_removed = 0
        
        for c in candidates:
            v_id = str(c.voter_id)
            if v_id in seen_voter_ids:
                logger.info(f"Deleting duplicate candidate ID {c.candidate_id} for voter {c.voter_id}")
                await db.delete(c)
                duplicates_removed += 1
            else:
                seen_voter_ids.add(v_id)
                
        if duplicates_removed > 0:
            await db.commit()
            print(f"Cleanup complete! Removed {duplicates_removed} duplicate candidate records.")
        else:
            print("No duplicate candidates found.")

if __name__ == "__main__":
    asyncio.run(cleanup_duplicates())
