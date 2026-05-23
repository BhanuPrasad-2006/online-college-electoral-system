import asyncio
from sqlalchemy import text
from app.db.session import engine
from app.utils.logger import logger

async def run_migration():
    async with engine.begin() as conn:
        logger.info("Adding running mates columns to candidates table...")
        
        # Add vice_president if not exists
        try:
            await conn.execute(text("ALTER TABLE candidates ADD COLUMN vice_president VARCHAR(255);"))
            logger.info("Added vice_president column.")
        except Exception as e:
            logger.info(f"vice_president column might already exist: {e}")
            
        # Add secretary if not exists
        try:
            await conn.execute(text("ALTER TABLE candidates ADD COLUMN secretary VARCHAR(255);"))
            logger.info("Added secretary column.")
        except Exception as e:
            logger.info(f"secretary column might already exist: {e}")

if __name__ == "__main__":
    asyncio.run(run_migration())
    print("Migration complete!")
