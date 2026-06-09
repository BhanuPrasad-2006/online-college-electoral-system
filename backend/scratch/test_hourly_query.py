import asyncio
from sqlalchemy import select, text, func as sa_func
from app.db.session import SessionLocal
from app.models.election import Election
from app.models.vote import Vote

async def main():
    async with SessionLocal() as db:
        result = await db.execute(select(Election).order_by(Election.created_at.desc()))
        election = result.scalars().first()
        if not election or not election.voting_start:
            print("No election or voting start time.")
            return

        from sqlalchemy import literal_column
        hourly_query = select(
            sa_func.date_trunc(literal_column("'hour'"), Vote.timestamp_utc).label('hour'),
            sa_func.count(Vote.vote_id).label('count')
        ).where(
            Vote.timestamp_utc >= election.voting_start
        ).group_by(
            sa_func.date_trunc(literal_column("'hour'"), Vote.timestamp_utc)
        ).order_by(
            sa_func.date_trunc(literal_column("'hour'"), Vote.timestamp_utc)
        )

        res = await db.execute(hourly_query)
        rows = res.all()
        print(f"Success! Fetched {len(rows)} rows.")
        for row in rows:
            print(f"  Hour: {row.hour}, Count: {row.count}")

if __name__ == "__main__":
    asyncio.run(main())
