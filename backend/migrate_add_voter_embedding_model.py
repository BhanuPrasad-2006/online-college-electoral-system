import asyncio
from sqlalchemy import text, inspect
from app.db.session import engine


async def migrate():
    async with engine.begin() as conn:
        print("=" * 50)
        print("Running migration: add embedding columns and indexes to voters")
        print("=" * 50)

        def run_migration_steps(connection):
            inspector = inspect(connection)
            columns = [c["name"] for c in inspector.get_columns("voters")]

            # 1. Add embedding_model_version
            if "embedding_model_version" in columns:
                print("  embedding_model_version column already exists, skipping.")
            else:
                print("  Adding column: embedding_model_version to table voters ...")
                connection.execute(text(
                    "ALTER TABLE voters ADD COLUMN embedding_model_version VARCHAR(50) NULL"
                ))
                print("  embedding_model_version column added.")

            # 2. Add failed_face_attempts
            if "failed_face_attempts" in columns:
                print("  failed_face_attempts column already exists, skipping.")
            else:
                print("  Adding column: failed_face_attempts to table voters ...")
                connection.execute(text(
                    "ALTER TABLE voters ADD COLUMN failed_face_attempts INTEGER DEFAULT 0"
                ))
                print("  failed_face_attempts column added.")

            # 3. Create indexes
            print("  Creating database indexes on voters table...")
            connection.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_voters_embedding_model ON voters(embedding_model_version);"
            ))
            connection.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_voters_failed_face ON voters(failed_face_attempts);"
            ))
            connection.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_voters_lockout ON voters(lockout_until);"
            ))
            print("  Indexes created successfully.")

        await conn.run_sync(run_migration_steps)

        print("=" * 50)
        print("Migration complete!")
        print("=" * 50)


if __name__ == "__main__":
    asyncio.run(migrate())
