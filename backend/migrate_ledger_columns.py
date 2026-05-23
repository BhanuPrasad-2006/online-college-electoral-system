import asyncio
import logging
from sqlalchemy import inspect, text
from app.db.session import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("migrate_ledger_columns")

async def migrate():
    logger.info("Starting database migration for vote ledger columns and ai_alerts columns...")
    
    # Define columns to check and add for 'votes'
    columns_to_add = [
        ("previous_hash", "CHAR(64) NULL"),
        ("current_hash", "CHAR(64) UNIQUE NULL"),
        ("ledger_sequence", "INTEGER NULL"),
        ("hash_version", "VARCHAR(10) DEFAULT 'v1'"),
        ("timestamp_utc", "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP")
    ]
    
    # Define columns to check and add for 'ai_alerts'
    alerts_columns_to_add = [
        ("confidence_score", "DOUBLE PRECISION NULL"),
        ("resolved_by", "VARCHAR(100) NULL")
    ]
    
    async with engine.connect() as conn:
        def get_existing_columns(sync_conn, table_name):
            inspector = inspect(sync_conn)
            try:
                return {col['name'] for col in inspector.get_columns(table_name)}
            except Exception:
                return set()
        
        try:
            # 1. Migrate 'votes' table
            existing_votes_cols = await conn.run_sync(lambda s: get_existing_columns(s, 'votes'))
            logger.info(f"Existing columns in 'votes' table: {existing_votes_cols}")
            
            for col_name, sql_type in columns_to_add:
                if col_name not in existing_votes_cols:
                    logger.info(f"Column '{col_name}' is missing in 'votes'. Adding it...")
                    alter_query = f"ALTER TABLE votes ADD COLUMN {col_name} {sql_type};"
                    await conn.execute(text(alter_query))
                    logger.info(f"Successfully added column '{col_name}' to 'votes'.")
                else:
                    logger.info(f"Column '{col_name}' already exists in 'votes'. Skipping.")
            
            # 2. Migrate 'ai_alerts' table
            existing_alerts_cols = await conn.run_sync(lambda s: get_existing_columns(s, 'ai_alerts'))
            logger.info(f"Existing columns in 'ai_alerts' table: {existing_alerts_cols}")
            
            for col_name, sql_type in alerts_columns_to_add:
                if col_name not in existing_alerts_cols:
                    logger.info(f"Column '{col_name}' is missing in 'ai_alerts'. Adding it...")
                    alter_query = f"ALTER TABLE ai_alerts ADD COLUMN {col_name} {sql_type};"
                    await conn.execute(text(alter_query))
                    logger.info(f"Successfully added column '{col_name}' to 'ai_alerts'.")
                else:
                    logger.info(f"Column '{col_name}' already exists in 'ai_alerts'. Skipping.")
            
            # Commit the transaction
            await conn.commit()
            logger.info("Database migration completed successfully!")
            
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            await conn.rollback()
            raise e

if __name__ == "__main__":
    asyncio.run(migrate())
