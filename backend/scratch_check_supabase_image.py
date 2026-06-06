import asyncio
import sys
import httpx
from app.db.session import SessionLocal
from app.models.voter import Voter

async def main():
    async with SessionLocal() as db:
        from sqlalchemy import select
        res = await db.execute(select(Voter).where(Voter.college_email == "1ds24cy015@dsce.edu.in"))
        voter = res.scalars().first()
        if not voter:
            print("Voter not found")
            return
            
        url = voter.reference_image_url
        print(f"Downloading from: {url}")
        
        async with httpx.AsyncClient() as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                out_path = "uploads/faces/db_ref.jpg"
                with open(out_path, "wb") as f:
                    f.write(resp.content)
                print(f"Successfully saved to {out_path}, size: {len(resp.content)} bytes")
            else:
                print(f"Failed to download: HTTP {resp.status_code}")

if __name__ == "__main__":
    asyncio.run(main())
