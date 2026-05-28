import asyncio
from sqlalchemy import text
from app.db.session import SessionLocal, engine
from app.models.audit_log import AuditLog
from datetime import datetime, timezone

async def test_tx():
    # 1. Create session
    async with SessionLocal() as session:
        try:
            # 2. Add log entry
            log = AuditLog(
                event_type="TEST_TX_COMMIT",
                actor_id=None,
                description="Testing if commit persists before exception",
                ip_address="127.0.0.1",
                created_at=datetime.now(timezone.utc)
            )
            session.add(log)
            await session.commit()
            print("Committed successfully inside block!")
            
            # 3. Simulate raising exception after commit
            raise ValueError("Simulated exception after commit")
        except Exception as e:
            print(f"Caught exception: {e}")
            print("Rolling back session...")
            await session.rollback()
            
    # 4. Check if log entry exists in DB
    async with SessionLocal() as session:
        res = await session.execute(text(
            "SELECT COUNT(*) FROM audit_logs WHERE event_type = 'TEST_TX_COMMIT'"
        ))
        count = res.scalar()
        print(f"Log entry count in DB after rollback: {count}")
        
        # Clean up
        if count > 0:
            await session.execute(text(
                "DELETE FROM audit_logs WHERE event_type = 'TEST_TX_COMMIT'"
            ))
            await session.commit()
            print("Cleaned up test log.")

if __name__ == "__main__":
    asyncio.run(test_tx())
