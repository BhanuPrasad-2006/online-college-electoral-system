import asyncio
from sqlalchemy import text
from app.db.session import engine


async def migrate():
    async with engine.begin() as conn:
        print("=" * 50)
        print("Running migration: manifesto approval columns")
        print("=" * 50)

        for col, ddl in [
            ("status", "ALTER TABLE manifestos ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'draft'"),
            ("admin_remarks", "ALTER TABLE manifestos ADD COLUMN admin_remarks VARCHAR(500) NULL"),
            ("reviewed_at", "ALTER TABLE manifestos ADD COLUMN reviewed_at TIMESTAMPTZ NULL"),
        ]:
            result = await conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='manifestos' AND column_name=:col"
            ), {"col": col})
            if result.fetchone():
                print(f"  Column {col} already exists, skipping.")
            else:
                print(f"  Adding column: {col}")
                await conn.execute(text(ddl))

        print("=" * 50)
        print("Migration complete!")
        print("=" * 50)


if __name__ == "__main__":
    asyncio.run(migrate())
