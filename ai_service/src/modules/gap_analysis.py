"""Manifesto gap analysis module — analyzes whether voter concern categories are covered by candidate manifesto."""
import json
import logging
from src.utils.gemini import call_gemini
from src.modules.gap_analysis_schema import ManifestoGapAnalysisResponseSchema

logger = logging.getLogger(__name__)


class ManifestoGapAnalyzer:
    def analyze_gaps(self, manifesto: str, categories: list[str]) -> dict:
        """
        Analyze gaps between candidate's manifesto and voter concern categories using Gemini 1.5 Flash.
        """
        if not categories:
            return {"coverages": []}

        system_instruction = (
            "You are an expert electoral analyst. Compare the candidate's manifesto with the list of student concern categories provided.\n"
            "For each category, determine:\n"
            "1. covered: Whether the candidate's manifesto addresses this concern category (true or false).\n"
            "2. explanation: A brief explanation of how the manifesto addresses it, or what is missing if it is not addressed.\n"
            "You must respond in strict JSON format conforming to the requested schema."
        )

        prompt = f"Manifesto:\n{manifesto}\n\nCategories to check:\n{', '.join(categories)}"

        try:
            response_text = call_gemini(
                prompt=prompt,
                system_instruction=system_instruction,
                response_schema=ManifestoGapAnalysisResponseSchema,
                response_mime_type="application/json",
                model="gemini-1.5-flash"
            )
            data = json.loads(response_text)
            return data
        except Exception as e:
            logger.error(f"Failed to perform gap analysis with Gemini: {e}")
            # Safe fallback: mark all as not covered with a default message
            return {
                "coverages": [
                    {
                        "category_name": cat,
                        "covered": False,
                        "explanation": "Could not verify coverage due to API analysis failure."
                    }
                    for cat in categories
                ]
            }
