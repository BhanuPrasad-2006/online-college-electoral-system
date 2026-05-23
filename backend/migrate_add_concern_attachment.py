import asyncio
from sqlalchemy import text, inspect
from app.db.session import engine


async def migrate():
    async with engine.begin() as conn:
        print("=" * 50)
        print("Running migration: add attachment_url to concerns")
        print("=" * 50)

        def check_and_add_column(connection):
            inspector = inspect(connection)
            columns = [c["name"] for c in inspector.get_columns("concerns")]
            if "attachment_url" in columns:
                print("  attachment_url column already exists, skipping.")
            else:
                print("  Adding column: attachment_url to table concerns ...")
                connection.execute(text(
                    "ALTER TABLE concerns ADD COLUMN attachment_url VARCHAR(500) NULL"
                ))
                print("  attachment_url column added.")

        await conn.run_sync(check_and_add_column)

        print("=" * 50)
        print("Migration complete!")
        print("=" * 50)


if __name__ == "__main__":
    asyncio.run(migrate())
