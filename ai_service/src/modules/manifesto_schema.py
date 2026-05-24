"""Pydantic schema definitions for parsing Gemini's structured manifesto analysis output."""
from pydantic import BaseModel, Field
from typing import List

class Contradiction(BaseModel):
    promise_a: str = Field(..., description="The first promise involved in the contradiction")
    promise_b: str = Field(..., description="The second promise involved in the contradiction")
    explanation: str = Field(..., description="Explanation of why these two promises are logically or mathematically conflicting, including the institutional context")

class ImpactStatement(BaseModel):
    promise: str = Field(..., description="The candidate promise being evaluated")
    trade_off: str = Field(..., description="A neutral, realistic institutional trade-off/estimate statement explaining the downstream impact or shift in resources required (e.g. shifts in budget, security, staffing, etc.)")

class ManifestoAnalysisSchema(BaseModel):
    sentiment_score: float = Field(..., description="Sentiment score from 0.0 to 1.0 (0 is negative, 1 is positive)")
    feasibility_score: float = Field(..., description="Feasibility score of the proposals from 0.0 to 1.0")
    key_themes: List[str] = Field(..., description="Key themes identified in the candidate manifesto (e.g. Education, Sports, Infrastructure, Technology)")
    summary: str = Field(..., description="Concise, non-biased summary of the candidate's manifesto")
    contradictions: List[Contradiction] = Field(
        default_factory=list,
        description="A list of mutually exclusive or logically conflicting promises found within the text. If none are found, return an empty list."
    )
    impact_statements: List[ImpactStatement] = Field(
        default_factory=list,
        description="A list mapping key candidate promises to their realistic institutional trade-offs, clearly keeping the tone neutral and labeled as system estimates."
    )
