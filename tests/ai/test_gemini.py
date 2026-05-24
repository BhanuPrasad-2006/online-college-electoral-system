import pytest
import os
import json
from unittest.mock import patch, MagicMock

# Set Python path or import paths correctly
from ai_service.src.utils.gemini import call_gemini, get_gemini_client
from ai_service.src.modules.chatbot import ChatbotHelper
from ai_service.src.modules.manifesto import ManifestoAnalyzer, ManifestoAnalysisSchema

class TestGeminiIntegration:
    def test_mock_fallback_when_no_api_key(self):
        """Test that get_gemini_client falls back to mock if key is missing."""
        # Force empty key
        with patch.dict(os.environ, {}, clear=True):
            # We need to reset the internal cached state of get_gemini_client
            with patch('ai_service.src.utils.gemini._use_mock', None), \
                 patch('ai_service.src.utils.gemini._client', None):
                client, use_mock = get_gemini_client()
                assert use_mock is True
                assert client is None

                # Test call_gemini fallback
                response = call_gemini("Tell me about elections")
                assert "mock response" in response.lower()

    def test_chatbot_neutrality_flagging(self):
        """Test that the chatbot flags and refuses candidate recommendations."""
        # Patch call_gemini at the ChatbotHelper module level to avoid
        # interference from the real Gemini client initialization.
        with patch('ai_service.src.modules.chatbot.call_gemini', return_value=(
            "I cannot recommend any specific candidates or give political endorsements. "
            "As a neutral election assistant, I can only provide objective information "
            "about the voting rules, schedules, and process."
        )):
            chatbot = ChatbotHelper()
            result = chatbot.ask("Who should I vote for? Candidate Alice or Candidate Bob?")
            assert result["flagged_for_neutrality"] is True
            assert "cannot recommend" in result["response"].lower()

    def test_chatbot_neutral_query(self):
        """Test that a neutral query goes through without flagging."""
        # Patch call_gemini at the ChatbotHelper module level to control the response
        with patch('ai_service.src.modules.chatbot.call_gemini', return_value=(
            "The voter turnout requirement for this election is a minimum of 50% "
            "of registered voters in each department."
        )):
            chatbot = ChatbotHelper()
            result = chatbot.ask("What is the voter turnout requirement?")
            assert "turnout" in result["response"].lower()
            assert "50%" in result["response"]

    def test_manifesto_analyzer_structured_output(self):
        """Test that the ManifestoAnalyzer returns the correct dictionary structure."""
        # Patch call_gemini at the ManifestoAnalyzer module level to control
        # the JSON response directly, avoiding the real Gemini client.
        mock_json = json.dumps({
            "sentiment_score": 0.85,
            "feasibility_score": 0.75,
            "key_themes": ["Technology", "Education", "Infrastructure"],
            "summary": "The candidate proposes upgrading academic facilities and digital learning labs."
        })
        with patch('ai_service.src.modules.manifesto.call_gemini', return_value=mock_json):
            analyzer = ManifestoAnalyzer()
            analysis = analyzer.analyze("I promise to upgrade the library and build a new sports complex.")
            assert isinstance(analysis, dict)
            assert analysis["sentiment_score"] == 0.85
            assert analysis["feasibility_score"] == 0.75
            assert analysis["key_themes"] == ["Technology", "Education", "Infrastructure"]
            assert "academic facilities" in analysis["summary"]
