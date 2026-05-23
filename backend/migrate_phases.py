import asyncio
from sqlalchemy import text
from app.db.session import engine
from app.db.base import Base
from app.models import *

async def migrate():
    async with engine.begin() as conn:
        print("Creating new tables...")
        await conn.run_sync(Base.metadata.create_all)
        
        print("Altering elections table to add new columns...")
        try:
            await conn.execute(text("ALTER TABLE elections ADD COLUMN auto_transition BOOLEAN DEFAULT TRUE NOT NULL;"))
            print("Added auto_transition column")
        except Exception as e:
            print(f"Column auto_transition might already exist: {e}")

        try:
            await conn.execute(text("ALTER TABLE elections ADD COLUMN is_paused BOOLEAN DEFAULT FALSE NOT NULL;"))
            print("Added is_paused column")
        except Exception as e:
            print(f"Column is_paused might already exist: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
