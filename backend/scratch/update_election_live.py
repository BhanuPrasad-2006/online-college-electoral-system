import asyncio
from datetime import datetime, timedelta, timezone
from sqlalchemy import text
from app.db.session import engine

async def main():
    async with engine.begin() as conn:
        print("Updating latest election to VOTING_OPEN with countdown...")
        
        # Calculate end time: 3 days, 14 hours, 27 minutes, 28 seconds in the future
        end_time = datetime.now(timezone.utc) + timedelta(days=3, hours=14, minutes=27, seconds=28)
        start_time = datetime.now(timezone.utc) - timedelta(days=1)
        
        res = await conn.execute(text("""
            UPDATE elections 
            SET status = 'VOTING_OPEN',
                results_published = false,
                results_published_at = null,
                voting_start = :start_time,
                voting_end = :end_time
            WHERE election_id = (SELECT election_id FROM elections ORDER BY created_at DESC LIMIT 1)
        """), {
            "start_time": start_time,
            "end_time": end_time
        })
        print(f"Updated {res.rowcount} election row(s).")

if __name__ == "__main__":
    asyncio.run(main())
