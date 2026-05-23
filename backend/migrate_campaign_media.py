import asyncio
from sqlalchemy import text
from app.db.session import engine
from app.utils.logger import logger

async def run_migration():
    async with engine.begin() as conn:
        logger.info("Creating campaign_media table if not exists...")
        
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS campaign_media (
                    media_id UUID PRIMARY KEY,
                    candidate_id UUID NOT NULL REFERENCES candidates(candidate_id) ON DELETE CASCADE,
                    type VARCHAR(50) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    uploaded_file_url VARCHAR(500),
                    external_url VARCHAR(500),
                    body TEXT,
                    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
                    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    reviewed_by UUID REFERENCES admin_users(admin_id) ON DELETE SET NULL,
                    reviewed_at TIMESTAMP WITH TIME ZONE,
                    rejection_reason VARCHAR(500)
                );
            """))
            logger.info("campaign_media table successfully created / verified.")
        except Exception as e:
            logger.error(f"Error during migration execution: {e}")
            raise e

if __name__ == "__main__":
    asyncio.run(run_migration())
    print("Migration complete!")
