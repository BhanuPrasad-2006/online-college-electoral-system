from pydantic import BaseModel, Field, field_validator
from typing import List, Optional


def validate_non_empty_whitespace(value: str, name: str) -> str:
    if not value.strip():
        raise ValueError(f"{name} cannot be empty or whitespace-only")
    return value


class ClassifyRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        return validate_non_empty_whitespace(v, "text")


class ClassifyResponse(BaseModel):
    category: str
    confidence: float
    sentiment_score: float


class ManifestoAnalysisRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=15000)

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        return validate_non_empty_whitespace(v, "content")


class ManifestoContradiction(BaseModel):
    statement_a: str
    statement_b: str
    explanation: str
    severity: str  # 'minor', 'moderate', or 'severe'


class ManifestoAnalysisResponse(BaseModel):
    sentiment_score: float
    feasibility_score: float
    key_themes: List[str]
    summary: str
    contradictions: List[ManifestoContradiction] = []


class CandidateInfo(BaseModel):
    """Candidate information for recommendation matching."""
    id: str
    name: str
    manifesto: str


class RecommendationRequest(BaseModel):
    concerns: List[str] = Field(..., min_length=1)
    candidates: Optional[List[CandidateInfo]] = Field(None, description="Optional candidate list. If omitted, demo placeholders are used.")

    @field_validator("concerns")
    @classmethod
    def validate_concerns(cls, v: List[str]) -> List[str]:
        if not v:
            raise ValueError("Concerns list cannot be empty")
        for i, concern in enumerate(v):
            if not concern.strip():
                raise ValueError(f"Concern at index {i} cannot be empty or whitespace-only")
            if len(concern) > 1000:
                raise ValueError(f"Concern at index {i} exceeds max length of 1000 characters")
        return v


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


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        return validate_non_empty_whitespace(v, "message")


class ClusterItem(BaseModel):
    cluster_id: int
    label: str
    size: int
    concerns: List[str]


class ClusterRequest(BaseModel):
    texts: List[str] = Field(..., min_length=1, description="List of concern texts to cluster")


class ClusterResponse(BaseModel):
    clusters: List[ClusterItem]
    num_clusters: int
    unclustered: List[str] = []


class ChatResponse(BaseModel):
    response: str
    flagged_for_neutrality: bool


class CampusReportRequest(BaseModel):
    """Request to generate a 'State of the Campus' report from aggregated concern data."""
    data: dict


class CampusReportResponse(BaseModel):
    """Generated campus report with executive summary, findings, trends, and actions."""
    executive_summary: str
    key_findings: list[str]
    trend_analysis: str
    suggested_actions: list[str]
