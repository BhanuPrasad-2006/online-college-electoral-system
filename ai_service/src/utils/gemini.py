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
    
    def get_gap_analysis_mock(prompt_str: str) -> str:
        categories = []
        if "categories to check:" in prompt_str.lower():
            try:
                parts = prompt_str.lower().split("categories to check:")
                cats_part = parts[1].strip()
                categories = [c.strip().title() for c in cats_part.split(",") if c.strip()]
            except Exception:
                pass
        if not categories:
            categories = ["Academic", "Infrastructure", "Campus Life", "Administration", "Other"]
        
        coverages = []
        manifesto_lower = prompt_str.lower().split("categories to check:")[0]
        for cat in categories:
            covered = False
            cat_l = cat.lower()
            if cat_l == "academic" and any(w in manifesto_lower for w in ["academic", "study", "library", "class", "course", "grade", "exam"]):
                covered = True
            elif cat_l == "infrastructure" and any(w in manifesto_lower for w in ["infrastructure", "wifi", "wi-fi", "facility", "building", "lab", "campus", "canteen", "cafeteria"]):
                covered = True
            elif (cat_l == "campus_life" or cat_l == "campus life") and any(w in manifesto_lower for w in ["life", "event", "sport", "club", "fest", "activity", "activities"]):
                covered = True
            elif cat_l == "administration" and any(w in manifesto_lower for w in ["admin", "office", "staff", "fee", "process", "rule", "management"]):
                covered = True
            elif cat_l == "other" and len(manifesto_lower) > 30:
                covered = True
            
            if covered:
                explanation = f"The candidate's manifesto addresses {cat.lower()} concerns with specific plans."
            else:
                explanation = f"No mention or clear proposal for addressing student {cat.lower()} grievances."
            
            coverages.append({
                "category_name": cat,
                "covered": covered,
                "explanation": explanation
            })
        return json.dumps({"coverages": coverages})

    if use_mock:
        logger.info("Executing Gemini call in MOCK fallback mode.")
        if response_mime_type == "application/json" or response_schema is not None:
            schema_name = getattr(response_schema, "__name__", "")
            if schema_name == "ManifestoGapAnalysisResponseSchema":
                return get_gap_analysis_mock(prompt)

            prompt_lower = prompt.lower()
            contradictions = []
            if "ticket" in prompt_lower and "budget" in prompt_lower:
                contradictions = [
                    {
                        "promise_a": "Reduce student council event ticket prices by 50%",
                        "promise_b": "Double the budget allocated to technical clubs",
                        "explanation": "You cannot decrease revenue while doubling expenditures without specifying an alternative funding source."
                    }
                ]
            
            mock_data = {
                "sentiment_score": 0.85,
                "feasibility_score": 0.75,
                "key_themes": ["Technology", "Education", "Infrastructure"],
                "summary": "Mock summary of the manifesto: The candidate proposes upgrading academic facilities and digital learning labs.",
                "contradictions": contradictions,
                "impact_statements": [
                    {
                        "promise": "24/7 unlimited access to the college library and computer labs",
                        "trade_off": "Implementing this requires shifting budget from student events or sports to pay for overnight security, electricity, and lab assistants."
                    }
                ]
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
        import time
        max_retries = 3
        retry_delay = 1.0
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=config
                )
                return response.text
            except Exception as e:
                err_msg = str(e).lower()
                if attempt < max_retries - 1 and any(msg in err_msg for msg in ["503", "unavailable", "429", "rate limit", "exhausted", "demand"]):
                    logger.warning(f"Transient Gemini error (attempt {attempt+1}/{max_retries}): {e}. Retrying in {retry_delay}s...")
                    time.sleep(retry_delay)
                    retry_delay *= 2
                    continue
                raise e
    except Exception as e:
        logger.error(f"Gemini API call failed: {e}. Falling back to mock.")
        if response_mime_type == "application/json" or response_schema is not None:
            schema_name = getattr(response_schema, "__name__", "")
            if schema_name == "ManifestoGapAnalysisResponseSchema":
                return get_gap_analysis_mock(prompt)

            prompt_lower = prompt.lower()
            contradictions = []
            if "ticket" in prompt_lower and "budget" in prompt_lower:
                contradictions = [
                    {
                        "promise_a": "Reduce student council event ticket prices by 50%",
                        "promise_b": "Double the budget allocated to technical clubs",
                        "explanation": "You cannot decrease revenue while doubling expenditures without specifying an alternative funding source."
                    }
                ]
            mock_data = {
                "sentiment_score": 0.5,
                "feasibility_score": 0.5,
                "key_themes": ["General"],
                "summary": f"Error fallback mock summary. (Exception: {str(e)[:50]})",
                "contradictions": contradictions,
                "impact_statements": []
            }
            return json.dumps(mock_data)
        return "I encountered an error communicating with the AI service. As a fallback: Please ensure candidate guidelines and polling hours are checked on the official college election bulletin board."

