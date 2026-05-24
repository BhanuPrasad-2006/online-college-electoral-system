"""Manifesto analysis module — analyzes feasibility, contradictions, themes, and sentiment using Gemini 2.5 Flash."""
import json
import logging
from pydantic import BaseModel, Field
from typing import Optional
from src.utils.gemini import call_gemini

logger = logging.getLogger(__name__)


class Contradiction(BaseModel):
    statement_a: str = Field(..., description="The first statement/promise from the manifesto that conflicts")
    statement_b: str = Field(..., description="The second statement/promise from the manifesto that conflicts")
    explanation: str = Field(..., description="Why these two statements are contradictory or in tension with each other")
    severity: str = Field(..., description="Severity of the contradiction: 'minor', 'moderate', or 'severe'")


class ManifestoAnalysisSchema(BaseModel):
    sentiment_score: float = Field(..., description="Sentiment score from 0.0 to 1.0 (0 is negative, 1 is positive)")
    feasibility_score: float = Field(..., description="Feasibility score of the proposals from 0.0 to 1.0")
    key_themes: list[str] = Field(..., description="Key themes identified in the candidate manifesto (e.g. Education, Sports, Infrastructure, Technology)")
    summary: str = Field(..., description="Concise, non-biased objective summary of the candidate's manifesto")
    contradictions: list[Contradiction] = Field(
        default_factory=list,
        description="List of contradictory or logically conflicting promises found in the manifesto. Empty list if none found.",
    )


class ManifestoAnalyzer:
    def analyze(self, content: str) -> dict:
        """
        Analyze a candidate's manifesto using Gemini 2.5 Flash and Structured JSON Output.
        Returns sentiment, feasibility, key themes, summary, and detected contradictions.
        """
        system_instruction = (
            "You are an expert electoral integrity analyst. Analyze the candidate's manifesto and extract: "
            "1. Sentiment score (0.0 to 1.0, negative to positive). "
            "2. Feasibility score of their proposals (0.0 to 1.0, low to high feasibility). "
            "3. Key themes present in the text. "
            "4. A clean, non-biased objective summary of the manifesto. "
            "5. **Contradictions**: Identify any statements or promises in the manifesto that "
            "logically conflict with each other. For example: promising to cut costs while "
            "also promising to spend more on multiple new initiatives; promising to reduce fees "
            "while also promising to double discretionary spending without identifying any funding source. "
            "Be conservative — only flag genuine logical tensions, not differing priorities. "
            "If no contradictions are found, return an empty list. "
            "Each contradiction must include: statement_a (direct quote), statement_b (direct quote), "
            "explanation (why they conflict), and severity ('minor', 'moderate', or 'severe'). "
            "You must respond in strict JSON format conforming to the requested schema."
        )

        try:
            response_text = call_gemini(
                prompt=content,
                system_instruction=system_instruction,
                response_schema=ManifestoAnalysisSchema,
                response_mime_type="application/json",
                model="gemini-2.5-flash"
            )
            data = json.loads(response_text)

            # Parse contradictions with safe defaults
            raw_contradictions = data.get("contradictions", [])
            if not isinstance(raw_contradictions, list):
                raw_contradictions = []
            contradictions = []
            for c in raw_contradictions:
                if isinstance(c, dict) and "statement_a" in c and "statement_b" in c:
                    contradictions.append({
                        "statement_a": str(c.get("statement_a", "")),
                        "statement_b": str(c.get("statement_b", "")),
                        "explanation": str(c.get("explanation", "")),
                        "severity": str(c.get("severity", "minor")),
                    })

            return {
                "sentiment_score": float(data.get("sentiment_score", 0.5)),
                "feasibility_score": float(data.get("feasibility_score", 0.5)),
                "key_themes": list(data.get("key_themes", ["General"])),
                "summary": str(data.get("summary", "Summary not available.")),
                "contradictions": contradictions,
            }
        except Exception as e:
            logger.error(f"Failed to analyze manifesto with Gemini: {e}")
            return {
                "sentiment_score": 0.5,
                "feasibility_score": 0.5,
                "key_themes": ["General"],
                "summary": "Fallback summary due to API analysis failure.",
                "contradictions": [],
            }
