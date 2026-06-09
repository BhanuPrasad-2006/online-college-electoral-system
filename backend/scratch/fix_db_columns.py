import asyncio
from sqlalchemy import text, inspect
from app.db.session import engine

async def main():
    async with engine.begin() as conn:
        def run_migrations(connection):
            inspector = inspect(connection)
            
            # 1. Candidate table check
            cand_cols = [c["name"] for c in inspector.get_columns("candidates")]
            print("Current candidate columns:", cand_cols)
            if "is_winner" not in cand_cols:
                print("Adding is_winner to candidates...")
                connection.execute(text(
                    "ALTER TABLE candidates ADD COLUMN is_winner BOOLEAN DEFAULT FALSE NOT NULL;"
                ))
            if "winner_announced_at" not in cand_cols:
                print("Adding winner_announced_at to candidates...")
                connection.execute(text(
                    "ALTER TABLE candidates ADD COLUMN winner_announced_at TIMESTAMP WITH TIME ZONE NULL;"
                ))

            # 2. Election table check
            election_cols = [c["name"] for c in inspector.get_columns("elections")]
            print("Current election columns:", election_cols)
            if "results_published" not in election_cols:
                print("Adding results_published to elections...")
                connection.execute(text(
                    "ALTER TABLE elections ADD COLUMN results_published BOOLEAN DEFAULT FALSE NOT NULL;"
                ))
            if "results_published_at" not in election_cols:
                print("Adding results_published_at to elections...")
                connection.execute(text(
                    "ALTER TABLE elections ADD COLUMN results_published_at TIMESTAMP WITH TIME ZONE NULL;"
                ))
                
            # 3. schema version update
            connection.execute(text("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)"))
            res = connection.execute(text("SELECT version FROM schema_version LIMIT 1")).fetchone()
            if not res:
                connection.execute(text("INSERT INTO schema_version (version) VALUES (2)"))
            else:
                connection.execute(text("UPDATE schema_version SET version = 2"))
            print("Schema version updated to 2.")

        await conn.run_sync(run_migrations)

if __name__ == "__main__":
    asyncio.run(main())
