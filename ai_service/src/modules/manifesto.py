"""Manifesto analysis module — analyzes feasibility, themes, sentiment, contradictions, and trade-offs using Gemini 2.5 Flash."""
import json
import logging
from src.utils.gemini import call_gemini
from src.modules.manifesto_schema import ManifestoAnalysisSchema

logger = logging.getLogger(__name__)


class ManifestoAnalyzer:
    def analyze(self, content: str) -> dict:
        """
        Analyze a candidate's manifesto using Gemini 2.5 Flash and Structured JSON Output.
        """
        system_instruction = (
            "You are an expert electoral analyst. Analyze the candidate's manifesto and extract:\n"
            "1. Sentiment score (0.0 to 1.0, negative to positive).\n"
            "2. Feasibility score of their proposals (0.0 to 1.0, low to high feasibility).\n"
            "3. Key themes present in the text (e.g., Education, Sports, Infrastructure, Technology).\n"
            "4. A clean, non-biased, objective summary of the manifesto.\n"
            "5. Contradictions: Strict check for logical, physical, or mathematical contradictions within the manifesto. "
            "Flag pairs of promises that mathematically or logically conflict (e.g., promising to cut student event ticket "
            "prices by 50% while simultaneously doubling the technical club budget without specifying any alternative funding source). "
            "If none are found, return an empty list.\n"
            "6. Impact Statements: For every major promise, generate a neutral, non-partisan impact note detailing realistic "
            "institutional trade-offs and estimated downstream impacts (e.g. 'Implementing 24/7 library access may require shifting "
            "budget allocations from campus events to cover overnight security and operational costs'). Keep the tone strictly neutral "
            "and formulate them clearly as system estimates.\n"
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
                "contradictions": data.get("contradictions", []),
                "impact_statements": data.get("impact_statements", []),
            }
        except Exception as e:
            logger.error(f"Failed to analyze manifesto with Gemini: {e}")
            return {
                "sentiment_score": 0.5,
                "feasibility_score": 0.5,
                "key_themes": ["General"],
                "summary": "Fallback summary due to API analysis failure.",
                "contradictions": [],
                "impact_statements": [],
            }

