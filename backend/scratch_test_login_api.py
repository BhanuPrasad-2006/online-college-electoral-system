import asyncio
import httpx

async def main():
    email = "1ds24cy015@dsce.edu.in"
    password = "bhanu@2006"
    url = "http://127.0.0.1:9001/api/v1/auth/voter/login"
    
    async with httpx.AsyncClient() as client:
        try:
            print(f"Sending POST to {url}...")
            res = await client.post(url, json={"email": email, "password": password}, timeout=10.0)
            print("Status Code:", res.status_code)
            print("Response:", res.text)
        except Exception as e:
            print("Request failed:", e)

if __name__ == "__main__":
    asyncio.run(main())
