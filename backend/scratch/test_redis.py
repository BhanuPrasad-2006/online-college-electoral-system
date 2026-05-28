import asyncio
from app.core.redis import redis_client

async def test_redis():
    try:
        ping = await redis_client.ping()
        print(f"Redis is connected! Ping response: {ping}")
        # Let's inspect some keys
        keys = await redis_client.keys("anti_replay:*")
        print(f"Total active anti-replay keys in Redis: {len(keys)}")
        for key in keys[:5]:
            val = await redis_client.get(key)
            print(f"  {key} -> {val}")
    except Exception as e:
        print(f"Redis is not running or failed to connect: {e}")

asyncio.run(test_redis())
