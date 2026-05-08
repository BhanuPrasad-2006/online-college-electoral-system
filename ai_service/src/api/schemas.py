from pydantic import BaseModel
from typing import List, Optional


class ClassifyRequest(BaseModel):
    text: str


class ClassifyResponse(BaseModel):
    category: str
    confidence: float
    sentiment_score: float


class ManifestoAnalysisRequest(BaseModel):
    content: str


class ManifestoAnalysisResponse(BaseModel):
    sentiment_score: float
    feasibility_score: float
    key_themes: List[str]
    summary: str


class RecommendationRequest(BaseModel):
    concerns: List[str]


class RecommendationResponse(BaseModel):
    candidate_id: str
    match_score: float
    matching_themes: List[str]
    explanation: str


class AnomalyRequest(BaseModel):
    voting_data: dict


class AnomalyAlert(BaseModel):
    alert_type: str
    severity: str
    description: str
    metadata: Optional[dict] = None


class AnomalyResponse(BaseModel):
    anomalies: List[AnomalyAlert]
