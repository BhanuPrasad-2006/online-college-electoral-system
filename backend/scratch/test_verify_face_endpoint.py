import asyncio
import os
import sys

sys.path.append(".")
import httpx

async def main():
    async with httpx.AsyncClient() as client:
        import jwt
        from datetime import datetime, timezone, timedelta
        from app.core.config import settings
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
        
        # 1. Test normal access token
        payload_access = {
            "sub": "b1a4c0c0-d21b-4e69-a36f-166de4fff416",
            "email": "yatishb1980@gmail.com",
            "role": "voter",
            "exp": expire,
            "token_type": "access"
        }
        token_access = jwt.encode(payload_access, settings.JWT_SECRET_KEY, algorithm="HS256")
        
        headers = {"Authorization": f"Bearer {token_access}"}
        verify_url = "http://localhost:8000/api/v1/vote/verify-face-passive"
        print(f"\nSending verify request to {verify_url} with normal access token...")
        res = await client.post(verify_url, headers=headers, json={
            "frames": ["data:image/jpeg;base64,/9j/4AAQSkZJRg=="],  # dummy frame
            "anti_replay_token": "dummy"
        })
        print(f"Response Status: {res.status_code}")
        print(f"Response JSON: {res.json()}")

        # 2. Test voting token
        payload_voting = {
            "sub": "b1a4c0c0-d21b-4e69-a36f-166de4fff416",
            "email": "yatishb1980@gmail.com",
            "role": "voter",
            "exp": expire,
            "token_type": "voting",
            "type": "voting"
        }
        token_voting = jwt.encode(payload_voting, settings.JWT_SECRET_KEY, algorithm="HS256")
        
        headers_voting = {"Authorization": f"Bearer {token_voting}"}
        print(f"\nSending verify request with voting token...")
        res_voting = await client.post(verify_url, headers=headers_voting, json={
            "frames": ["data:image/jpeg;base64,/9j/4AAQSkZJRg=="],  # dummy frame
            "anti_replay_token": "dummy"
        })
        print(f"Response Status: {res_voting.status_code}")
        print(f"Response JSON: {res_voting.json()}")

if __name__ == "__main__":
    asyncio.run(main())
