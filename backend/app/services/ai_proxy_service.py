"""AI proxy service — forwards requests to AI microservice with authentication."""

import httpx
from app.core.config import settings


class AIProxyService:
    def __init__(self):
        # Strip trailing slash if present, and ensure it ends with /api
        url = settings.AI_SERVICE_URL.rstrip("/")
        if not url.endswith("/api"):
            self.base_url = f"{url}/api"
        else:
            self.base_url = url
        self.headers = {"X-API-Key": settings.AI_SERVICE_API_KEY}

    async def classify_concern(self, text: str) -> dict:
        """Classify concern text using AI."""
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.post(
                f"{self.base_url}/classify",
                json={"text": text},
                headers=self.headers
            )
            return response.json()

    async def analyze_manifesto(self, content: str) -> dict:
        """Analyze manifesto using AI."""
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.post(
                f"{self.base_url}/analyze-manifesto",
                json={"content": content},
                headers=self.headers
            )
            return response.json()

    async def get_recommendations(self, user_concerns: list) -> list:
        """Get candidate recommendations based on user concerns."""
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.post(
                f"{self.base_url}/recommend",
                json={"concerns": user_concerns},
                headers=self.headers
            )
            return response.json()

    async def detect_anomalies(self, voting_data: dict) -> list:
        """Detect voting anomalies."""
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.post(
                f"{self.base_url}/detect-anomalies",
                json=voting_data,
                headers=self.headers
            )
            return response.json()

    async def generate_report(self, election_id: str) -> dict:
        """Generate AI election analysis report."""
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.post(
                f"{self.base_url}/generate-report",
                json={"election_id": election_id},
                headers=self.headers
            )
            return response.json()

    async def analyze_gaps(self, manifesto: str, categories: list[str]) -> dict:
        """Perform gap analysis between a manifesto and voter concern categories."""
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.post(
                f"{self.base_url}/analyze-gaps",
                json={"manifesto": manifesto, "categories": categories},
                headers=self.headers
            )
            return response.json()


