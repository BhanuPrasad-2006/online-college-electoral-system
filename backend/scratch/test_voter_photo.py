import asyncio
import httpx

async def test():
    # Try fetching a voter reference photo from the backend
    from app.db.session import SessionLocal
    from sqlalchemy import select
    from app.models.voter import Voter
    
    async with SessionLocal() as db:
        res = await db.execute(select(Voter).where(Voter.reference_image_url.isnot(None)).limit(1))
        voter = res.scalar_one_or_none()
        if voter:
            print(f"Voter: {voter.full_name}")
            print(f"Voter ID: {voter.voter_id}")
            print(f"Reference URL: {voter.reference_image_url}")
            
            # Test the backend endpoint
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.get(f"http://localhost:8000/api/v1/vote/voters/{voter.voter_id}/reference-photo")
                ct = r.headers.get("content-type", "N/A")
                print(f"Backend response: {r.status_code}, Content-Type: {ct}")
                print(f"Content length: {len(r.content)} bytes")
                if r.status_code != 200:
                    print(f"Error body: {r.text[:200]}")
        else:
            print("No voter with reference image found")

asyncio.run(test())
