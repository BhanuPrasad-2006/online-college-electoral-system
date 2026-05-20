import asyncio
import sys
from sqlalchemy import text

sys.path.append(".")
from app.db.session import engine, SessionLocal

async def run():
    async with SessionLocal() as db:
        res = await db.execute(text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'manifestos'
        """))
        for row in res.all():
            print(f"Column: {row[0]} | Type: {row[1]}")

if __name__ == "__main__":
    asyncio.run(run())
