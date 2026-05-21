"""
One-time migration script.
Adds `verification_code` column to the `voters` table.
Also cleans up `voter_code` if it was accidentally added in a previous session.

Run once from the backend directory:
    python migrate_add_verification_code.py
"""
import asyncio
from sqlalchemy import text
from app.db.session import engine


async def migrate():
    async with engine.begin() as conn:
        print("=" * 50)
        print("Running migration: add verification_code to voters")
        print("=" * 50)

        # ── 1. Drop voter_code if it exists (was added by mistake) ──
        result = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='voters' AND column_name='voter_code'"
        ))
        if result.fetchone():
            print("  Dropping stale column: voter_code ...")
            await conn.execute(text("ALTER TABLE voters DROP COLUMN voter_code"))
            print("  voter_code dropped.")
        else:
            print("  voter_code not present, skipping drop.")

        # ── 2. Add verification_code if it doesn't exist ────────────
        result = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='voters' AND column_name='verification_code'"
        ))
        if result.fetchone():
            print("  verification_code already exists, skipping ADD.")
        else:
            print("  Adding column: verification_code ...")
            await conn.execute(text(
                "ALTER TABLE voters ADD COLUMN verification_code VARCHAR(32) UNIQUE"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_voters_verification_code "
                "ON voters(verification_code)"
            ))
            print("  verification_code added and indexed.")

        print("=" * 50)
        print("Migration complete! You can now restart the backend.")
        print("=" * 50)


if __name__ == "__main__":
    asyncio.run(migrate())
