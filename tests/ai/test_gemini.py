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
        chatbot = ChatbotHelper()

        # In mock mode (or actual mode), asking "who should I vote for" should flag neutrality
        with patch('ai_service.src.utils.gemini._use_mock', True):
            result = chatbot.ask("Who should I vote for? Candidate Alice or Candidate Bob?")
            assert result["flagged_for_neutrality"] is True
            assert "cannot recommend" in result["response"].lower() or "endorse" in result["response"].lower() or "neutral" in result["response"].lower()

    def test_chatbot_neutral_query(self):
        """Test that a neutral query goes through without flagging."""
        chatbot = ChatbotHelper()
        with patch('ai_service.src.utils.gemini._use_mock', True):
            result = chatbot.ask("What is the voter turnout requirement?")
            # Neutral query might not trigger the pro-active prompt check
            assert "mock response" in result["response"].lower()

    def test_manifesto_analyzer_structured_output(self):
        """Test that the ManifestoAnalyzer returns the correct dictionary structure."""
        analyzer = ManifestoAnalyzer()
        
        # Test in mock mode
        with patch('ai_service.src.utils.gemini._use_mock', True):
            analysis = analyzer.analyze("I promise to upgrade the library and build a new sports complex.")
            assert isinstance(analysis, dict)
            assert "sentiment_score" in analysis
            assert "feasibility_score" in analysis
            assert "key_themes" in analysis
            assert "summary" in analysis
            assert "contradictions" in analysis
            assert "impact_statements" in analysis
            assert isinstance(analysis["key_themes"], list)
            assert len(analysis["key_themes"]) > 0
            assert isinstance(analysis["summary"], str)
            assert isinstance(analysis["contradictions"], list)
            assert len(analysis["contradictions"]) == 0
            assert isinstance(analysis["impact_statements"], list)
            assert len(analysis["impact_statements"]) > 0

    def test_manifesto_analyzer_contradiction_detection(self):
        """Test that mock mode simulates a contradiction when conflicting terms are present."""
        analyzer = ManifestoAnalyzer()
        
        with patch('ai_service.src.utils.gemini._use_mock', True):
            # Pass conflicting promises about tickets and budget
            analysis = analyzer.analyze("I will cut ticket prices for events and double the technical club budget.")
            assert isinstance(analysis, dict)
            assert len(analysis["contradictions"]) > 0
            assert "ticket" in analysis["contradictions"][0]["promise_a"].lower()
            assert "budget" in analysis["contradictions"][0]["promise_b"].lower()

