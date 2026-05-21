"""Manifesto analysis module — analyzes feasibility, themes, and sentiment using Gemini 2.5 Flash."""
import json
import logging
from pydantic import BaseModel, Field
from src.utils.gemini import call_gemini

logger = logging.getLogger(__name__)

class ManifestoAnalysisSchema(BaseModel):
    sentiment_score: float = Field(..., description="Sentiment score from 0.0 to 1.0 (0 is negative, 1 is positive)")
    feasibility_score: float = Field(..., description="Feasibility score of the proposals from 0.0 to 1.0")
    key_themes: list[str] = Field(..., description="Key themes identified in the candidate manifesto (e.g. Education, Sports, Infrastructure, Technology)")
    summary: str = Field(..., description="Concise, non-biased summary of the candidate's manifesto")

class ManifestoAnalyzer:
    def analyze(self, content: str) -> dict:
        """
        Analyze a candidate's manifesto using Gemini 2.5 Flash and Structured JSON Output.
        """
        system_instruction = (
            "You are an expert electoral analyst. Analyze the candidate's manifesto and extract: "
            "1. Sentiment score (0.0 to 1.0, negative to positive). "
            "2. Feasibility score of their proposals (0.0 to 1.0, low to high feasibility). "
            "3. Key themes present in the text. "
            "4. A clean, non-biased objective summary of the manifesto. "
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
            
            return {
                "sentiment_score": float(data.get("sentiment_score", 0.5)),
                "feasibility_score": float(data.get("feasibility_score", 0.5)),
                "key_themes": list(data.get("key_themes", ["General"])),
                "summary": str(data.get("summary", "Summary not available.")),
            }
        except Exception as e:
            logger.error(f"Failed to analyze manifesto with Gemini: {e}")
            return {
                "sentiment_score": 0.5,
                "feasibility_score": 0.5,
                "key_themes": ["General"],
                "summary": "Fallback summary due to API analysis failure.",
            }
