import asyncio
from sqlalchemy import text, inspect
from app.db.session import engine


async def migrate():
    async with engine.begin() as conn:
        print("=" * 50)
        print("Running migration: add to_candidate_id to concerns")
        print("=" * 50)

        def check_and_add_column(connection):
            inspector = inspect(connection)
            columns = [c["name"] for c in inspector.get_columns("concerns")]
            if "to_candidate_id" in columns:
                print("  to_candidate_id column already exists, skipping.")
            else:
                print("  Adding column: to_candidate_id to table concerns ...")
                connection.execute(text(
                    "ALTER TABLE concerns ADD COLUMN to_candidate_id VARCHAR(36) NULL"
                ))
                print("  to_candidate_id column added.")

        await conn.run_sync(check_and_add_column)

        print("=" * 50)
        print("Migration complete!")
        print("=" * 50)


if __name__ == "__main__":
    asyncio.run(migrate())
