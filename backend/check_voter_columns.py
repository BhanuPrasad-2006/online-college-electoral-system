import asyncio
from sqlalchemy import text
from app.db.session import engine

async def check():
    async with engine.connect() as conn:
        result = await conn.execute(text(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='voters' ORDER BY ordinal_position"
        ))
        print("Current voters table columns:")
        print("-" * 40)
        for row in result:
            print(f"  {row[0]} - {row[1]}")
        print("-" * 40)

asyncio.run(check())
