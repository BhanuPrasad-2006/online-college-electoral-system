import pytest
from unittest.mock import patch, AsyncMock

# Test candidates AI integrations
from app.routes.candidates import get_manifesto_analysis_safe


class TestCandidatesAIIntegration:
    @pytest.mark.asyncio
    @patch("app.routes.candidates.ai_proxy.analyze_manifesto", new_callable=AsyncMock)
    async def test_get_manifesto_analysis_safe_success(self, mock_analyze):
        # Setup mock response
        mock_analyze.return_value = {
            "sentiment_score": 0.8,
            "feasibility_score": 0.9,
            "key_themes": ["Infrastructure"],
            "summary": "Upgrade Wi-Fi",
            "contradictions": [],
            "impact_statements": [{"promise": "Unlimited Wi-Fi", "trade_off": "Costs cover overnight bandwidth"}]
        }
        
        result = await get_manifesto_analysis_safe("We will upgrade Wi-Fi.")
        assert result["sentiment_score"] == 0.8
        assert result["feasibility_score"] == 0.9
        assert len(result["contradictions"]) == 0
        assert len(result["impact_statements"]) == 1
        assert result["impact_statements"][0]["promise"] == "Unlimited Wi-Fi"

    @pytest.mark.asyncio
    @patch("app.routes.candidates.ai_proxy.analyze_manifesto", new_callable=AsyncMock)
    async def test_get_manifesto_analysis_safe_error_fallback(self, mock_analyze):
        # Force an exception to simulate service failure
        mock_analyze.side_effect = Exception("Service unavailable")
        
        result = await get_manifesto_analysis_safe("We will upgrade Wi-Fi.")
        assert result["sentiment_score"] == 0.5
        assert result["feasibility_score"] == 0.5
        assert len(result["contradictions"]) == 0
        assert len(result["impact_statements"]) == 0
        assert "unavailable" in result["summary"].lower()
