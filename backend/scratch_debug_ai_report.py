import asyncio
import httpx
import jwt
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.candidate import Candidate
from app.core.config import settings

async def main():
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    url = settings.DATABASE_URL.replace("aws-1-ap-southeast-1.pooler.supabase.com", "13.213.241.248")
    engine = create_async_engine(url)
    Session = async_sessionmaker(bind=engine)
    async with Session() as db:
        res = await db.execute(select(Candidate))
        candidate = res.scalars().first()
        if not candidate:
            print("No candidates found in database!")
            return
        
        print(f"Testing with candidate ID: {candidate.candidate_id}, Voter ID: {candidate.voter_id}")
        
        # Generate JWT token
        expire = datetime.now(timezone.utc) + timedelta(minutes=10)
        payload = {
            "sub": str(candidate.candidate_id),
            "role": "candidate",
            "user_id": str(candidate.candidate_id),
            "exp": expire
        }
        token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get("http://127.0.0.1:8000/api/v1/ai/concern-categories", headers=headers)
                print(f"Status Code: {response.status_code}")
                print(f"Response Headers: {response.headers}")
                print(f"Response Body: {response.text}")
            except Exception as e:
                import traceback
                print("Connection failed:")
                traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
