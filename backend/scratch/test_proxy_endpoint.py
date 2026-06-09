import asyncio
import httpx
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.voter import Voter

async def test_proxy():
    # 1. Fetch a voter ID that has a reference_image_url from the DB
    async with SessionLocal() as db:
        query = select(Voter).where(Voter.reference_image_url != None)
        result = await db.execute(query)
        voter = result.scalars().first()
        if not voter:
            print("No voter with photo found in DB.")
            return

        voter_id = str(voter.voter_id)
        print(f"Testing for Voter: {voter.full_name} ({voter_id})")

    # 2. Call the proxy endpoint
    url = f"http://localhost:8000/api/v1/vote/voters/{voter_id}/reference-photo"
    print(f"Requesting: {url}")
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, timeout=10.0)
            print(f"Response Status Code: {resp.status_code}")
            print(f"Response Content-Type: {resp.headers.get('content-type')}")
            print(f"Response Length: {len(resp.content)} bytes")
            if resp.status_code == 200:
                print("SUCCESS: Endpoint works correctly!")
            else:
                print(f"FAILED: {resp.text[:300]}")
        except Exception as e:
            print(f"Request Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_proxy())
