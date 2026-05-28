import asyncio
from sqlalchemy import text
from app.db.session import engine

async def get_voter():
    async with engine.connect() as conn:
        print("Querying voter details...")
        res = await conn.execute(text(
            "SELECT voter_id, college_email, face_encoding IS NOT NULL, lockout_until, failed_face_attempts, is_verified, has_voted FROM voters WHERE college_email = '1ds24cy015@dsce.edu.in'"
        ))
        row = res.fetchone()
        if row:
            print("Voter found:")
            print(f"  Voter ID: {row[0]}")
            print(f"  Email: {row[1]}")
            print(f"  Has Face Encoding Enrolled: {row[2]}")
            print(f"  Lockout Until: {row[3]}")
            print(f"  Failed Face Attempts: {row[4]}")
            print(f"  Is Verified: {row[5]}")
            print(f"  Has Voted: {row[6]}")
        else:
            print("Voter NOT found in database.")

asyncio.run(get_voter())
