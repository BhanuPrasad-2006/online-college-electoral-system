import asyncio
from sqlalchemy import text
from app.db.session import SessionLocal, engine

async def main():
    async with engine.connect() as conn:
        print("Adding column vote_permission to voters table...")
        await conn.execute(text("ALTER TABLE voters ADD COLUMN IF NOT EXISTS vote_permission BOOLEAN DEFAULT FALSE;"))
        await conn.commit()
        print("Column added successfully!")

if __name__ == "__main__":
    asyncio.run(main())
