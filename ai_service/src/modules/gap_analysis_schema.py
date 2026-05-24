"""Pydantic schema definitions for parsing Gemini's gap analysis between student concerns and manifesto."""
from pydantic import BaseModel, Field
from typing import List

class CategoryCoverage(BaseModel):
    category_name: str = Field(..., description="The name of the student concern category being checked")
    covered: bool = Field(..., description="Whether the manifesto text addresses this concern category")
    explanation: str = Field(..., description="A brief explanation of how the manifesto addresses it, or what is missing if it is a gap")

class ManifestoGapAnalysisResponseSchema(BaseModel):
    coverages: List[CategoryCoverage] = Field(
        default_factory=list,
        description="List detailing the coverage status of each concern category in the manifesto"
    )
