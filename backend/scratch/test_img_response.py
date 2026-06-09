import asyncio
import httpx

async def check():
    url = "https://pqlqymurxlklsdeexvzp.supabase.co/storage/v1/object/public/campaign-media/faces/CSE/pending_1DS24CY060_b1a4c0.jpg"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        print(f"Status: {resp.status_code}")
        print(f"Headers: {dict(resp.headers)}")
        print(f"Content Length: {len(resp.content)}")
        print(f"Content Start: {resp.content[:50]}")

if __name__ == "__main__":
    asyncio.run(check())
