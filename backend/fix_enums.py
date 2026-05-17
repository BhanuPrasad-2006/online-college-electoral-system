import asyncio
from sqlalchemy import text
from app.db.session import engine

async def check():
    async with engine.connect() as conn:
        r = await conn.execute(text(
            "SELECT t.typname, e.enumlabel FROM pg_type t "
            "JOIN pg_enum e ON t.oid = e.enumtypid "
            "WHERE t.typname IN ('concern_category','sentiment_label') "
            "ORDER BY t.typname, e.enumsortorder"
        ))
        for row in r.fetchall():
            print(f"{row[0]}: {repr(row[1])}")

asyncio.run(check())
