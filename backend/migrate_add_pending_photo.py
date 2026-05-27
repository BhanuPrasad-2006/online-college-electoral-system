"""
Migration: Add pending_image_url, pending_face_encoding, previous_image_url, previous_face_encoding
columns to the voters table.
"""

import asyncio
from sqlalchemy import text
from app.db.session import SessionLocal


async def migrate():
    print("Starting migration: add pending/previous photo columns...")
    async with SessionLocal() as db:
        conn = await db.connection()

        # Add pending_image_url
        try:
            await conn.execute(text("ALTER TABLE voters ADD COLUMN pending_image_url VARCHAR(500);"))
            print("  ✓ Added pending_image_url column")
        except Exception as e:
            if "already exists" in str(e):
                print("  - pending_image_url already exists, skipping")
            else:
                print(f"  ✗ Error adding pending_image_url: {e}")

        # Add pending_face_encoding
        try:
            await conn.execute(text("ALTER TABLE voters ADD COLUMN pending_face_encoding TEXT;"))
            print("  ✓ Added pending_face_encoding column")
        except Exception as e:
            if "already exists" in str(e):
                print("  - pending_face_encoding already exists, skipping")
            else:
                print(f"  ✗ Error adding pending_face_encoding: {e}")

        # Add previous_image_url
        try:
            await conn.execute(text("ALTER TABLE voters ADD COLUMN previous_image_url VARCHAR(500);"))
            print("  ✓ Added previous_image_url column")
        except Exception as e:
            if "already exists" in str(e):
                print("  - previous_image_url already exists, skipping")
            else:
                print(f"  ✗ Error adding previous_image_url: {e}")

        # Add previous_face_encoding
        try:
            await conn.execute(text("ALTER TABLE voters ADD COLUMN previous_face_encoding TEXT;"))
            print("  ✓ Added previous_face_encoding column")
        except Exception as e:
            if "already exists" in str(e):
                print("  - previous_face_encoding already exists, skipping")
            else:
                print(f"  ✗ Error adding previous_face_encoding: {e}")

        await db.commit()
    print("Migration complete.")


if __name__ == "__main__":
    asyncio.run(migrate())
