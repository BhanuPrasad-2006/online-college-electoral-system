import asyncio
import sys
from sqlalchemy import text
from app.db.session import engine
from app.utils.logger import logger

async def run_migration():
    async with engine.begin() as conn:
        logger.info("Adding face ID columns to voters table...")
        
        # Add reference_image_url if not exists
        try:
            await conn.execute(text("ALTER TABLE voters ADD COLUMN reference_image_url VARCHAR(500);"))
            logger.info("Added reference_image_url column.")
        except Exception as e:
            logger.info(f"reference_image_url column might already exist: {e}")
            
        # Add face_encoding if not exists
        try:
            await conn.execute(text("ALTER TABLE voters ADD COLUMN face_encoding TEXT;"))
            logger.info("Added face_encoding column.")
        except Exception as e:
            logger.info(f"face_encoding column might already exist: {e}")

if __name__ == "__main__":
    asyncio.run(run_migration())
    print("Migration complete!")
