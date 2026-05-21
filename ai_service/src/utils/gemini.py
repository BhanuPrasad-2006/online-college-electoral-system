import os
import json
import logging

logger = logging.getLogger(__name__)

try:
    from google import genai
    from google.genai import types
    SDK_AVAILABLE = True
except ImportError:
    SDK_AVAILABLE = False
    # Define a dummy types object to prevent name errors at parse time
    types = None


_client = None
_use_mock = None

def get_gemini_client():
    """
    Initializes and returns the Gemini Client utilizing the modern class instantiation pattern.
    If the initialization fails or the API key is not present, falls back to a mock mode.
    """
    global _client, _use_mock
    if _use_mock is not None:
        return _client, _use_mock

    if not SDK_AVAILABLE:
        logger.warning("google-genai SDK is not installed/available. Using mock fallback.")
        _use_mock = True
        return None, True

    # Check if the GEMINI_API_KEY environment variable is present
    api_key = os.environ.get("GEMINI_API_KEY")

    if not api_key:
        logger.warning("GEMINI_API_KEY environment variable is not set. Using mock fallback.")
        _use_mock = True
        return None, True

    try:
        # Modern class instantiation pattern
        _client = genai.Client()
        _use_mock = False
        return _client, False
    except Exception as e:
        logger.warning(f"Error initializing Gemini client: {e}. Using mock fallback.")
        _use_mock = True
        return None, True

def call_gemini(
    prompt: str,
    system_instruction: str = None,
    response_schema = None,
    response_mime_type: str = None,
    model: str = "gemini-2.5-flash"
) -> str:
    """
    Calls the Gemini API using the modern Client structure and gemini-2.5-flash model.
    Falls back to mock data if no API key is present or if an error is encountered.
    """
    client, use_mock = get_gemini_client()
    
    if use_mock:
        logger.info("Executing Gemini call in MOCK fallback mode.")
        if response_mime_type == "application/json" or response_schema is not None:
            mock_data = {
                "sentiment_score": 0.85,
                "feasibility_score": 0.75,
                "key_themes": ["Technology", "Education", "Infrastructure"],
                "summary": "Mock summary of the manifesto: The candidate proposes upgrading academic facilities and digital learning labs."
            }
            return json.dumps(mock_data)
        else:
            prompt_lower = prompt.lower()
            if any(word in prompt_lower for word in ["vote for", "recommend candidate", "who is better", "should i vote"]):
                return "I cannot recommend any specific candidates or give political endorsements. As a neutral election assistant, I can only provide objective information about the voting rules, schedules, and process."
            return f"Mock Response: This is a mock response because no active GEMINI_API_KEY is configured. (Your prompt was: '{prompt[:40]}...')"

    # Construct the config object using the modern google-genai patterns
    config = types.GenerateContentConfig()
    if system_instruction:
        config.system_instruction = system_instruction
    if response_schema:
        config.response_schema = response_schema
    if response_mime_type:
        config.response_mime_type = response_mime_type

    try:
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=config
        )
        return response.text
    except Exception as e:
        logger.error(f"Gemini API call failed: {e}. Falling back to mock.")
        if response_mime_type == "application/json" or response_schema is not None:
            mock_data = {
                "sentiment_score": 0.5,
                "feasibility_score": 0.5,
                "key_themes": ["General"],
                "summary": f"Error fallback mock summary. (Exception: {str(e)[:50]})"
            }
            return json.dumps(mock_data)
        return "I encountered an error communicating with the AI service. As a fallback: Please ensure candidate guidelines and polling hours are checked on the official college election bulletin board."
