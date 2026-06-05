import asyncio
from sqlalchemy import text
from app.db.session import engine

async def get_voters_models():
    async with engine.connect() as conn:
        res = await conn.execute(text(
            "SELECT voter_id, college_email, embedding_model_version, length(COALESCE(face_encoding, '')) FROM voters"
        ))
        rows = res.fetchall()
        for row in rows:
            print(f"Email: {row[1]}, Version: {row[2]}, Encoding Len: {row[3]}")

asyncio.run(get_voters_models())
