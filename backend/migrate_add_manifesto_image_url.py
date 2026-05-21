import asyncio
from sqlalchemy import text
from app.db.session import engine


async def migrate():
    async with engine.begin() as conn:
        print("=" * 50)
        print("Running migration: add image_url to manifestos")
        print("=" * 50)

        # Check if column exists
        result = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='manifestos' AND column_name='image_url'"
        ))
        if result.fetchone():
            print("  image_url column already exists, skipping.")
        else:
            print("  Adding column: image_url to table manifestos ...")
            await conn.execute(text(
                "ALTER TABLE manifestos ADD COLUMN image_url VARCHAR(500) NULL"
            ))
            print("  image_url column added.")

        print("=" * 50)
        print("Migration complete!")
        print("=" * 50)


if __name__ == "__main__":
    asyncio.run(migrate())
