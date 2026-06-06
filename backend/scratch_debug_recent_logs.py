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
        print("Fetching biometric failure & lockout logs...")
        from sqlalchemy import or_
        query = select(AuditLog).where(
            or_(
                AuditLog.event_type.ilike("%failure%"),
                AuditLog.event_type.ilike("%lockout%"),
                AuditLog.event_type.ilike("%reject%")
            )
        ).order_by(AuditLog.created_at.desc()).limit(30)
        res = await db.execute(query)
        logs = res.scalars().all()
        for log in logs:
            desc = log.description or ""
            print(f"[{log.created_at}] {log.event_type}: {desc[:200]}")

if __name__ == "__main__":
    asyncio.run(main())
