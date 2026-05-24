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


class ContradictionResponse(BaseModel):
    promise_a: str
    promise_b: str
    explanation: str


class ImpactStatementResponse(BaseModel):
    promise: str
    trade_off: str


class ManifestoAnalysisResponse(BaseModel):
    sentiment_score: float
    feasibility_score: float
    key_themes: List[str]
    summary: str
    contradictions: List[ContradictionResponse] = []
    impact_statements: List[ImpactStatementResponse] = []



class RecommendationRequest(BaseModel):
    concerns: List[str] = Field(..., min_length=1)

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


class ChatResponse(BaseModel):
    response: str
    flagged_for_neutrality: bool


class CategoryCoverageResponse(BaseModel):
    category_name: str
    covered: bool
    explanation: str


class GapAnalysisRequest(BaseModel):
    manifesto: str = Field(..., max_length=15000)
    categories: List[str] = Field(default_factory=list)

    @field_validator("categories")
    @classmethod
    def validate_categories(cls, v: List[str]) -> List[str]:
        for i, category in enumerate(v):
            if not category.strip():
                raise ValueError(f"Category at index {i} cannot be empty or whitespace-only")
        return v


class GapAnalysisResponse(BaseModel):
    coverages: List[CategoryCoverageResponse] = []

