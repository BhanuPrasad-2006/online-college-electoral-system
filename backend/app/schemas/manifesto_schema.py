from pydantic import BaseModel
from typing import Optional, List


class ManifestoGoal(BaseModel):
    title: str
    description: str
    category: str
    priority: str = "medium"


class ManifestoCreateRequest(BaseModel):
    title: str
    content: str
    goals: List[ManifestoGoal] = []


class ManifestoResponse(BaseModel):
    id: str
    candidate_id: str
    title: str
    content: str
    goals: List[dict] = []
    ai_sentiment_score: Optional[float] = None
    ai_feasibility_score: Optional[float] = None
    ai_key_themes: List[str] = []
    ai_summary: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True
