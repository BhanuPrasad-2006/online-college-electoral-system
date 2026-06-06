import asyncio
import sys
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

sys.path.append(".")
from app.db.session import engine
from app.models.audit_log import AuditLog

async def main():
    SessionLocal = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with SessionLocal() as db:
        print("Fetching latest 50 audit logs of any type...")
        query = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(50)
        res = await db.execute(query)
        logs = res.scalars().all()
        for log in logs:
            desc = log.description or ""
            print(f"[{log.created_at}] Actor: {log.actor_id} | {log.event_type}: {desc[:150]}")

if __name__ == "__main__":
    asyncio.run(main())
