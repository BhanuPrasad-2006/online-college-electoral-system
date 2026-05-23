from pydantic import BaseModel
from typing import Optional


class ConcernCreateRequest(BaseModel):
    title: str
    description: str
    category: str
    attachment_url: Optional[str] = None


class ConcernResponse(BaseModel):
    id: str
    title: str
    description: str
    category: str
    status: str
    upvotes: int
    attachment_url: Optional[str] = None
    ai_classification: Optional[str] = None
    sentiment_score: Optional[float] = None
    created_at: str

    class Config:
        from_attributes = True
