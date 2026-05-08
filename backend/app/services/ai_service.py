"""AI service proxy — forwards requests to AI microservice."""

import httpx
from app.core.config import settings


class AIService:
    def __init__(self):
        self.base_url = settings.AI_SERVICE_URL

    async def classify_concern(self, text: str) -> dict:
        """Classify concern text using AI."""
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{self.base_url}/classify", json={"text": text})
            return response.json()

    async def analyze_manifesto(self, content: str) -> dict:
        """Analyze manifesto using AI."""
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{self.base_url}/analyze-manifesto", json={"content": content})
            return response.json()

    async def get_recommendations(self, user_concerns: list) -> list:
        """Get candidate recommendations based on user concerns."""
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{self.base_url}/recommend", json={"concerns": user_concerns})
            return response.json()

    async def detect_anomalies(self, voting_data: dict) -> list:
        """Detect voting anomalies."""
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{self.base_url}/detect-anomalies", json=voting_data)
            return response.json()
