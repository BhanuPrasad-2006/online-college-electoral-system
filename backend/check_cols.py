import asyncio
from sqlalchemy import inspect
from app.db.session import engine

async def main():
    async with engine.begin() as conn:
        def get_cols(connection):
            return [c["name"] for c in inspect(connection).get_columns("candidates")]
        cols = await conn.run_sync(get_cols)
        print("Candidates columns:", cols)

if __name__ == "__main__":
    asyncio.run(main())
