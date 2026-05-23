import asyncio
from sqlalchemy import text
from app.db.session import engine

async def check():
    async with engine.connect() as conn:
        for tbl in ['voters', 'candidates', 'manifestos']:
            result = await conn.execute(text(
                f"SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name='{tbl}' ORDER BY ordinal_position"
            ))
            print(f"\nCurrent {tbl} table columns:")
            print("-" * 40)
            for row in result:
                print(f"  {row[0]} - {row[1]} (len: {row[2]})")
            print("-" * 40)

asyncio.run(check())
