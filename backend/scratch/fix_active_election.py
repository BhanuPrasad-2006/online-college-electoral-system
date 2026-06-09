import asyncio
from sqlalchemy import text
from app.db.session import engine

async def main():
    async with engine.begin() as conn:
        print("Reconciling election publication state...")
        res = await conn.execute(text("""
            UPDATE elections 
            SET results_published = true, 
                results_published_at = COALESCE(results_published_at, NOW()) 
            WHERE status = 'RESULTS_PUBLISHED'
        """))
        print(f"Updated {res.rowcount} election row(s).")

if __name__ == "__main__":
    asyncio.run(main())
