import asyncio
from sqlalchemy import select
import sys
sys.path.append(".")
from app.db.session import SessionLocal
from app.models.audit_log import AuditLog

async def main():
    async with SessionLocal() as db:
        query = (
            select(AuditLog)
            .where(
                (AuditLog.event_type.like("%FACE%")) | 
                (AuditLog.event_type.like("%BIOMETRIC%"))
            )
            .order_by(AuditLog.created_at.desc())
            .limit(20)
        )
        res = await db.execute(query)
        logs = res.scalars().all()
        
        print(f"Found {len(logs)} face/biometric audit logs:")
        for log in logs:
            print("-" * 50)
            print(f"Time: {log.created_at}")
            print(f"Event: {log.event_type}")
            print(f"Actor ID: {log.actor_id}")
            print(f"Desc: {log.description}")
            print(f"IP: {log.ip_address}")

if __name__ == "__main__":
    asyncio.run(main())
