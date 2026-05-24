"""AI proxy service — forwards requests to AI microservice with authentication."""

import json
import urllib.request
import urllib.error
from app.core.config import settings


class AIProxyService:
    def __init__(self):
        self.base_url = settings.AI_SERVICE_URL.rstrip("/")
        self.api_key = settings.AI_SERVICE_API_KEY

    def _post(self, path: str, payload: dict) -> dict:
        """Synchronous POST to the AI microservice using built-in urllib."""
        url = f"{self.base_url}/api{path}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "X-API-Key": self.api_key,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8")
            raise RuntimeError(f"AI service HTTP {e.code}: {body}") from e
        except urllib.error.URLError as e:
            raise RuntimeError(f"AI service connection failed: {e.reason}") from e

    async def classify_concern(self, text: str) -> dict:
        """Classify concern text using AI."""
        return self._post("/classify", {"text": text})

    async def analyze_manifesto(self, content: str) -> dict:
        """Analyze manifesto using AI."""
        return self._post("/analyze-manifesto", {"content": content})

    async def get_recommendations(self, user_concerns: list) -> list:
        """Get candidate recommendations based on user concerns."""
        return self._post("/recommend", {"concerns": user_concerns})

    async def detect_anomalies(self, voting_data: dict) -> list:
        """Detect voting anomalies."""
        return self._post("/detect-anomalies", voting_data)

    async def cluster_concerns(self, texts: list) -> dict:
        """Cluster similar concern texts together."""
        return self._post("/cluster", {"texts": texts})

    async def generate_report(self, election_id: str) -> dict:
        """Generate AI election analysis report."""
        return self._post("/generate-report", {"election_id": election_id})

    async def generate_campus_report(self, concern_data: dict) -> dict:
        """Generate 'State of the Campus' report from aggregated concern data."""
        return self._post("/campus-report", {"data": concern_data})
