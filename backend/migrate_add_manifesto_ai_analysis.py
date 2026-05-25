import asyncio
from sqlalchemy import text
from app.db.session import engine


async def migrate():
    async with engine.begin() as conn:
        print("=" * 50)
        print("Running migration: add ai_analysis to manifestos")
        print("=" * 50)

        # Check if column exists
        result = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='manifestos' AND column_name='ai_analysis'"
        ))
        if result.fetchone():
            print("  ai_analysis column already exists, skipping.")
        else:
            print("  Adding column: ai_analysis to table manifestos ...")
            await conn.execute(text(
                "ALTER TABLE manifestos ADD COLUMN ai_analysis TEXT NULL"
            ))
            print("  ai_analysis column added.")

        print("=" * 50)
        print("Migration complete!")
        print("=" * 50)


if __name__ == "__main__":
    asyncio.run(migrate())
