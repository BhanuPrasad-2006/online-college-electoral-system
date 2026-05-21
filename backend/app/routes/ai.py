"""
backend/app/routes/ai.py — AI Chatbot API Route
=================================================
Exposes:
  POST /api/v1/ai/chat   — Multi-turn conversational AI chatbot for voters.
  GET  /api/v1/ai/chat/suggestions — Returns suggested questions.

Session-based Gemini chat history is maintained in-process using a simple
dictionary keyed by session_id (UUID). Each session holds a Gemini Chat object
so multi-turn context is preserved across requests.

Environment variables required (set in backend/.env):
  GEMINI_API_KEY=your_gemini_api_key_here
"""

import uuid
import logging
from typing import Dict
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.ai.context_data import SYSTEM_INSTRUCTION, CANDIDATE_MANIFESTOS, STUDENT_CONCERNS

logger = logging.getLogger(__name__)

router = APIRouter()

# ── SDK import with graceful fallback ─────────────────────────────────────────
try:
    from google import genai
    from google.genai import types as genai_types
    SDK_AVAILABLE = True
    logger.info("google-genai SDK loaded successfully.")
except ImportError:
    SDK_AVAILABLE = False
    logger.warning("google-genai SDK not installed. Chatbot will use mock fallback mode.")

# ── In-memory session store ────────────────────────────────────────────────────
# Maps session_id (str) → Gemini Chat object (or None if mock mode)
# NOTE: This is reset on server restart. For production, use Redis.
_chat_sessions: Dict[str, object] = {}

# ── Gemini client (singleton) ─────────────────────────────────────────────────
_gemini_client = None

def _get_gemini_client():
    """Lazily initialize the Gemini client using GEMINI_API_KEY from Settings (loaded from .env)."""
    global _gemini_client
    if _gemini_client is not None:
        return _gemini_client
    if not SDK_AVAILABLE:
        return None
    api_key = settings.GEMINI_API_KEY.strip()
    if not api_key:
        logger.warning("GEMINI_API_KEY not set in .env. Chatbot will use mock fallback mode.")
        return None
    try:
        _gemini_client = genai.Client(api_key=api_key)
        logger.info("Gemini client initialized successfully with key from .env.")
        return _gemini_client
    except Exception as e:
        logger.error(f"Failed to initialize Gemini client: {e}")
        return None


# ── Mock fallback responses ────────────────────────────────────────────────────
_MOCK_RESPONSES = [
    "I can help you compare candidates! (Running in demo mode — set GEMINI_API_KEY to activate live AI).",
    "Based on the submitted manifestos, here's what I found... (Demo mode — configure your API key for real responses).",
    "Great question! The candidates have different positions on this issue. (Demo mode active).",
]
_mock_counter = 0

def _mock_response(message: str) -> str:
    global _mock_counter
    candidate_names = list(CANDIDATE_MANIFESTOS.keys())
    resp = (
        f"**Demo Mode Active** — I don't have a live Gemini API key yet.\n\n"
        f"In production, I will answer your question: *\"{message[:80]}...\"*\n\n"
        f"Current candidates in this election:\n"
        + "\n".join(f"- **{n}** ({info['party']}, {info['position']})" for n, info in CANDIDATE_MANIFESTOS.items())
        + "\n\nAsk me to compare them on topics like Wi-Fi, Placements, Sports, or Mental Health!"
    )
    _mock_counter += 1
    return resp


# ── Pydantic schemas ───────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    session_id: str | None = None   # Optional; if None, a new session is created
    message: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    is_mock: bool = False


class SuggestionsResponse(BaseModel):
    suggestions: list[str]


# ── Suggested questions ────────────────────────────────────────────────────────
SUGGESTED_QUESTIONS = [
    "Compare all candidates on Wi-Fi improvements",
    "Which candidates address placement issues?",
    "What are the top student concerns this election?",
    "Tell me about Arjun Mehta's platform",
    "Who has plans for mental health support?",
    "Compare candidates on cafeteria improvements",
    "What does Priya Sharma plan for hostels?",
    "Which candidate focuses on sports facilities?",
]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/chat/suggestions", response_model=SuggestionsResponse)
async def get_suggestions():
    """Return suggested questions for the chatbot UI."""
    return SuggestionsResponse(suggestions=SUGGESTED_QUESTIONS)


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Multi-turn AI chatbot endpoint.

    - Creates a new Gemini chat session if session_id is None or unknown.
    - Maintains conversation history per session using Gemini's built-in chat management.
    - Falls back to mock responses if the SDK is unavailable or API key is missing.
    """
    if not request.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty."
        )

    # Resolve or create session ID
    session_id = request.session_id
    if not session_id or session_id not in _chat_sessions:
        session_id = str(uuid.uuid4())

    client = _get_gemini_client()

    # ── Mock mode ─────────────────────────────────────────────────────────────
    if client is None:
        _chat_sessions[session_id] = None  # Register session even in mock
        return ChatResponse(
            session_id=session_id,
            reply=_mock_response(request.message),
            is_mock=True,
        )

    # ── Live Gemini mode ──────────────────────────────────────────────────────
    try:
        # Get or create a Gemini Chat session for this session_id
        if session_id not in _chat_sessions or _chat_sessions[session_id] is None:
            chat_session = client.chats.create(
                model="gemini-2.5-flash",
                config=genai_types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    temperature=0.3,        # Lower = more factual, less creative
                    max_output_tokens=1024,
                ),
            )
            _chat_sessions[session_id] = chat_session
        else:
            chat_session = _chat_sessions[session_id]

        # Send the user message and get the AI response
        response = chat_session.send_message(request.message)
        reply_text = response.text

        return ChatResponse(
            session_id=session_id,
            reply=reply_text,
            is_mock=False,
        )

    except Exception as e:
        logger.error(f"Gemini API error for session {session_id}: {e}")
        # On API error, return a safe fallback instead of crashing
        return ChatResponse(
            session_id=session_id,
            reply=(
                "I encountered an issue reaching the AI service. Please try again in a moment.\n\n"
                f"_(Error: {str(e)[:120]})_"
            ),
            is_mock=True,
        )


@router.delete("/chat/{session_id}", status_code=status.HTTP_200_OK)
async def clear_session(session_id: str):
    """Clear a specific chat session (e.g., on user logout or 'New Chat')."""
    if session_id in _chat_sessions:
        del _chat_sessions[session_id]
    return {"message": "Session cleared.", "session_id": session_id}


# ── Legacy stub endpoints (kept for backward compatibility) ────────────────────

@router.post("/analyze")
async def analyze(db: AsyncSession = Depends(get_db)):
    """Analyze election data using AI."""
    return {"message": "AI analyze endpoint — use /chat for the chatbot."}


@router.get("/insights")
async def insights(db: AsyncSession = Depends(get_db)):
    """Retrieve AI-generated insights for the election."""
    return {"message": "AI insights endpoint — use /chat for the chatbot."}


@router.post("/detect-anomaly")
async def detect_anomaly(db: AsyncSession = Depends(get_db)):
    """Detect voting anomalies using AI."""
    return {"message": "AI detect anomaly endpoint."}
