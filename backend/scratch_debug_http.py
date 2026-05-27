import asyncio
import httpx
import jwt
from datetime import datetime, timezone, timedelta

def main():
    JWT_SECRET_KEY = "64e64e5163d418ff0fda208dcb5fd7f5721063f7075e833aea1d16fb959df3a5"
    candidate_id = "c1e5356c-ce7e-486b-abd2-c8bd6bab4642"
    
    # Generate JWT token
    expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {
        "sub": candidate_id,
        "role": "candidate",
        "user_id": candidate_id,
        "exp": expire
    }
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm="HS256")
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    
    # Call backend server running on port 8000
    try:
        response = httpx.get("http://127.0.0.1:8000/api/v1/ai/concern-categories", headers=headers, timeout=10.0)
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {response.headers}")
        print(f"Response Body: {response.text}")
    except Exception as e:
        print(f"Connection/HTTP call failed: {e}")

if __name__ == "__main__":
    main()
