import asyncio
import logging
from sqlalchemy import text
from app.db.session import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("migrate_anti_replay")

async def migrate():
    logger.info("Starting database migration for anti_replay_tokens table...")
    
    create_table_query = """
    CREATE TABLE IF NOT EXISTS anti_replay_tokens (
        token VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL
    );
    """
    
    async with engine.connect() as conn:
        try:
            logger.info("Creating anti_replay_tokens table if it does not exist...")
            await conn.execute(text(create_table_query))
            await conn.commit()
            logger.info("Database migration completed successfully!")
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            await conn.rollback()
            raise e

if __name__ == "__main__":
    asyncio.run(migrate())
