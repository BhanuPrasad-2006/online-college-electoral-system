import asyncio
from sqlalchemy import text
from app.db.session import engine

async def check_tokens():
    async with engine.connect() as conn:
        print("Querying all anti-replay tokens sorted by expiry...")
        res = await conn.execute(text(
            "SELECT token, user_id, expires_at FROM anti_replay_tokens ORDER BY expires_at DESC"
        ))
        rows = res.fetchall()
        print(f"Total active anti-replay tokens in DB: {len(rows)}")
        for idx, row in enumerate(rows):
            print(f"[{idx}] Token: {row[0][:15]}..., User: {row[1]}, Expires: {row[2]}")

asyncio.run(check_tokens())
