import pytest
import json
from unittest.mock import patch
from ai_service.src.modules.gap_analysis import ManifestoGapAnalyzer
from ai_service.src.api.routes import router
from fastapi.testclient import TestClient
from fastapi import FastAPI


class TestGapAnalysisService:
    def test_gap_analyzer_mock_mode(self):
        """Test the ManifestoGapAnalyzer outputs correct coverage in mock mode."""
        analyzer = ManifestoGapAnalyzer()
        
        with patch('ai_service.src.utils.gemini._use_mock', True):
            # Test when manifesto has matching words
            manifesto = "I will improve study library rooms and classes and college wifi and labs."
            categories = ["academic", "infrastructure", "administration"]
            
            result = analyzer.analyze_gaps(manifesto, categories)
            assert "coverages" in result
            coverages = result["coverages"]
            assert len(coverages) == 3
            
            academic = next(x for x in coverages if x["category_name"].lower() == "academic")
            infra = next(x for x in coverages if x["category_name"].lower() == "infrastructure")
            admin = next(x for x in coverages if x["category_name"].lower() == "administration")
            
            assert academic["covered"] is True
            assert infra["covered"] is True
            assert admin["covered"] is False

    @pytest.mark.asyncio
    async def test_analyze_gaps_endpoint(self):
        """Test the POST /analyze-gaps API route in mock mode."""
        from ai_service.src.api.routes import analyze_gaps
        from ai_service.src.api.schemas import GapAnalysisRequest
        
        with patch('ai_service.src.utils.gemini._use_mock', True):
            request = GapAnalysisRequest(
                manifesto="I will improve study rooms.",
                categories=["Academic", "Infrastructure"]
            )
            response = await analyze_gaps(request)
            
            # Response is a Pydantic object
            assert hasattr(response, "coverages")
            coverages = response.coverages
            assert len(coverages) == 2
            
            academic = next(x for x in coverages if x.category_name == "Academic")
            infra = next(x for x in coverages if x.category_name == "Infrastructure")
            
            assert academic.covered is True
            assert infra.covered is False
