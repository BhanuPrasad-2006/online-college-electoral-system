import asyncio
import httpx
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.voter import Voter

async def debug_voter_faces():
    async with SessionLocal() as db:
        query = select(Voter)
        res = await db.execute(query)
        voters = res.scalars().all()
        async with httpx.AsyncClient() as client:
            for v in voters:
                if not v.reference_image_url and not v.pending_image_url:
                    continue
                print(f"Voter: {v.full_name}")
                print(f"  USN: {v.student_id}")
                print(f"  Ref URL: {v.reference_image_url}")
                print(f"  Pending URL: {v.pending_image_url}")
                if v.reference_image_url:
                    if v.reference_image_url.startswith("http"):
                        try:
                            resp = await client.head(v.reference_image_url)
                            print(f"  Ref Fetch Status: {resp.status_code}")
                            if resp.status_code >= 400:
                                resp_full = await client.get(v.reference_image_url)
                                print(f"  Ref Fetch Detail: {resp_full.text[:200]}")
                        except Exception as e:
                            print(f"  Ref Fetch Error: {e}")
                    else:
                        print(f"  Ref URL is local/relative")

if __name__ == "__main__":
    asyncio.run(debug_voter_faces())
