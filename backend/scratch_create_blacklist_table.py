import asyncio
from app.db.session import engine
from app.db.base import Base
from app.models.blacklisted_token import BlacklistedToken

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        print("Successfully created blacklisted_tokens table!")

if __name__ == "__main__":
    asyncio.run(init_db())
