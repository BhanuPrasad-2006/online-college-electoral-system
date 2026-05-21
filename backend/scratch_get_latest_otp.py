import asyncio
import sys
from sqlalchemy import select, desc
from app.db.session import SessionLocal
from app.models.otp_request import OTPRequest

async def get_latest_otp(recipient: str):
    async with SessionLocal() as db:
        query = select(OTPRequest).where(
            OTPRequest.recipient == recipient,
            OTPRequest.is_used == False
        ).order_by(desc(OTPRequest.created_at))
        
        res = await db.execute(query)
        otp_record = res.scalars().first()
        if otp_record:
            print(f"LATEST_OTP_FOUND:{otp_record.recipient}:{otp_record.otp_hash}")
        else:
            print("NO_ACTIVE_OTP")

if __name__ == "__main__":
    recipient = sys.argv[1] if len(sys.argv) > 1 else "1ds24cy015@dsce.edu.in"
    asyncio.run(get_latest_otp(recipient))
