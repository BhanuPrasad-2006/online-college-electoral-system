import asyncio
import os
import sys
import base64
import cv2
import numpy as np
import httpx
import jwt
from datetime import datetime, timezone, timedelta
from sqlalchemy import select

sys.path.append(".")
from app.db.session import SessionLocal
from app.models.voter import Voter
from app.core.config import settings
from app.security.anti_replay_service import AntiReplayService
from app.services.face_service import redis_face_lockout

async def main():
    print("Initializing E2E Pipeline Test...")
    voter_id = "b1a4c0c0-d21b-4e69-a36f-166de4fff416"
    voter_email = "yatishb1980@gmail.com"
    
    # 1. Reset voter lockouts and failed attempts in DB & Redis
    async with SessionLocal() as db:
        res = await db.execute(select(Voter).where(Voter.voter_id == voter_id))
        voter = res.scalars().first()
        if not voter:
            print("Voter not found in DB")
            return
            
        voter.failed_face_attempts = 0
        voter.lockout_until = None
        await db.commit()
        print("Voter database lockouts reset.")

        # Clear Redis lockout
        await redis_face_lockout.clear_lockout(voter_id)
        
        # Clear daily limit in Redis
        try:
            from app.routes.vote import redis_daily_counter
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            await redis_daily_counter.redis.delete(f"face_daily:{voter_id}:{today}")
            print("Redis attempt counters cleared.")
        except Exception as e:
            print(f"Skipped redis daily counter clear: {e}")

        # Generate fresh anti-replay token
        anti_replay_token = await AntiReplayService.generate_token(voter_id, db)
        print(f"Generated Anti-Replay Token: {anti_replay_token}")

    # 2. Load reference image and generate 10 frames with slight variations to avoid identical frame checks
    ref_path = "uploads/faces/yatish_ref.jpg"
    if not os.path.exists(ref_path):
        print(f"Reference photo {ref_path} does not exist.")
        return
        
    img = cv2.imread(ref_path)
    if img is None:
        print("Failed to load reference image.")
        return
        
    print("Generating 10 simulated webcam frames with micro-variations...")
    frames = []
    for i in range(10):
        # Apply slight transformation based on frame index
        temp = img.copy()
        if i == 0:
            pass
        elif i == 1:
            # Shift right by 1 pixel
            M = np.float32([[1, 0, 1], [0, 1, 0]])
            temp = cv2.warpAffine(temp, M, (temp.shape[1], temp.shape[0]))
        elif i == 2:
            # Shift left by 1 pixel
            M = np.float32([[1, 0, -1], [0, 1, 0]])
            temp = cv2.warpAffine(temp, M, (temp.shape[1], temp.shape[0]))
        elif i == 3:
            # Shift down by 1 pixel
            M = np.float32([[1, 0, 0], [0, 1, 1]])
            temp = cv2.warpAffine(temp, M, (temp.shape[1], temp.shape[0]))
        elif i == 4:
            # Shift up by 1 pixel
            M = np.float32([[1, 0, 0], [0, 1, -1]])
            temp = cv2.warpAffine(temp, M, (temp.shape[1], temp.shape[0]))
        elif i == 5:
            # Rotate by 0.5 degrees
            M = cv2.getRotationMatrix2D((temp.shape[1]/2, temp.shape[0]/2), 0.5, 1.0)
            temp = cv2.warpAffine(temp, M, (temp.shape[1], temp.shape[0]))
        elif i == 6:
            # Rotate by -0.5 degrees
            M = cv2.getRotationMatrix2D((temp.shape[1]/2, temp.shape[0]/2), -0.5, 1.0)
            temp = cv2.warpAffine(temp, M, (temp.shape[1], temp.shape[0]))
        elif i == 7:
            # Add subtle gaussian noise
            noise = np.random.normal(0, 0.5, temp.shape).astype(np.uint8)
            temp = cv2.add(temp, noise)
        elif i == 8:
            # Adjust brightness slightly
            temp = cv2.convertScaleAbs(temp, alpha=1.0, beta=1)
        elif i == 9:
            # Adjust contrast slightly
            temp = cv2.convertScaleAbs(temp, alpha=1.01, beta=0)

        # Encode to base64 JPEG
        success, encoded = cv2.imencode(".jpg", temp)
        if not success:
            print(f"Failed to encode frame {i}")
            return
        b64_str = "data:image/jpeg;base64," + base64.b64encode(encoded.tobytes()).decode("utf-8")
        frames.append(b64_str)

    # 3. Generate a valid voting session token
    expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    payload_voting = {
        "sub": voter_id,
        "email": voter_email,
        "role": "voter",
        "exp": expire,
        "token_type": "voting",
        "type": "voting"
    }
    token_voting = jwt.encode(payload_voting, settings.JWT_SECRET_KEY, algorithm="HS256")
    
    # 4. Post request to the local API server
    async with httpx.AsyncClient() as client:
        headers_voting = {"Authorization": f"Bearer {token_voting}"}
        verify_url = "http://localhost:8000/api/v1/vote/verify-face-passive"
        
        print("\nSending verify-face-passive request to local server...")
        try:
            res = await client.post(verify_url, headers=headers_voting, json={
                "frames": frames,
                "anti_replay_token": anti_replay_token
            }, timeout=30.0)
            print(f"Response Status Code: {res.status_code}")
            print("Response JSON output:")
            print(res.json())
        except Exception as e:
            import traceback
            print(f"HTTP request failed: {repr(e)}")
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
