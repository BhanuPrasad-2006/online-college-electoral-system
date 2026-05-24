"""
backend/app/routes/ai.py — AI Chatbot API Route
=================================================
Exposes:
  POST /api/v1/ai/chat   — Multi-turn conversational AI chatbot for voters.
  GET  /api/v1/ai/chat/suggestions — Returns suggested questions grouped by category.

Session-based Gemini chat history is maintained in-process using a simple
dictionary keyed by session_id (UUID). Each session holds a Gemini Chat object
so multi-turn context is preserved across requests.

Environment variables required (set in backend/.env):
  GEMINI_API_KEY=your_gemini_api_key_here
"""

import uuid
import logging
from typing import Dict, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.core.config import settings
from app.db.session import get_db
from app.ai.context_data import (
    SYSTEM_INSTRUCTION,
    build_system_instruction,
    format_dynamic_context,
    CANDIDATE_MANIFESTOS,
    STUDENT_CONCERNS,
    VOTER_RULES,
    CANDIDATE_RULES,
    ELECTION_PHASES,
    FAQ,
)
from app.models.election import Election
from app.models.position import Position
from app.models.candidate import Candidate
from app.models.manifesto import Manifesto
from app.models.voter import Voter
from app.enums.candidate_status import CandidateStatusEnum
from app.services.phase_engine import PhaseEngine

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
# Maps session_id (str) → {"chat": Gemini Chat object, "instruction": str}
# NOTE: This is reset on server restart. For production, use Redis.
_chat_sessions: Dict[str, dict] = {}

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

def _build_mock_system_preview() -> str:
    """Build a preview of the system knowledge for mock mode."""
    candidate_names = list(CANDIDATE_MANIFESTOS.keys())
    concern_names = list(STUDENT_CONCERNS.keys())
    phase_names = [p["label"] for p in ELECTION_PHASES]

    return (
        "**Demo Mode Active** — I don't have a live Gemini API key yet.\n\n"
        "In production, I can answer questions about:\n\n"
        f"**Candidates:** {', '.join(candidate_names)}\n"
        f"**Student Concerns:** {', '.join(concern_names[:4])}, and more\n"
        f"**Election Phases:** {', '.join(phase_names)}\n\n"
        "**Try asking me:**\n"
        "• Compare all candidates on Wi-Fi improvements\n"
        "• How do I register to vote?\n"
        "• What are the top student concerns?\n"
        "• Who is running for General Secretary?\n"
        "• How is vote security maintained?\n\n"
        "Set a **GEMINI_API_KEY** in your `.env` file to activate the live AI!"
    )

_mock_counter = 0

def _mock_response(message: str) -> str:
    global _mock_counter
    message_lower = message.lower().strip()

    # Try to simulate basic intent matching for mock mode
    if any(w in message_lower for w in ["register", "how do i vote", "how to vote"]):
        return (
            "**Demo Mode** — Here's how voting registration works:\n\n"
            "1. Log in with your student ID and college email.\n"
            "2. Go to the registration section.\n"
            "3. Fill in your details (department, year, mobile).\n"
            "4. Verify your email via OTP.\n"
            "5. Wait for admin to grant voting permission.\n\n"
            "Set GEMINI_API_KEY for detailed live responses!"
        )

    if any(w in message_lower for w in ["manifesto", "platform", "candidate", "compare"]):
        candidates_info = "\n".join(
            f"• **{n}** — {info['party']} ({info['department']}, {info['year']})"
            for n, info in CANDIDATE_MANIFESTOS.items()
        )
        return (
            f"**Demo Mode** — Current candidates in this election:\n\n{candidates_info}\n\n"
            "Ask me to compare them on topics like Wi-Fi, Placements, Sports, or Mental Health!\n"
            "(Set GEMINI_API_KEY for live AI responses.)"
        )

    if any(w in message_lower for w in ["concern", "issue", "problem", "student"]):
        concerns_info = "\n".join(
            f"• **{c}** ({d['vote_count']} votes, {d['severity']} severity)"
            for c, d in list(STUDENT_CONCERNS.items())[:5]
        )
        return (
            f"**Demo Mode** — Top student concerns:\n\n{concerns_info}\n\n"
            "Set GEMINI_API_KEY for detailed analysis!"
        )

    if any(w in message_lower for w in ["phase", "schedule", "timeline", "when"]):
        phases_info = "\n".join(
            f"• **{p['label']}** — {p['description'][:80]}..."
            for p in ELECTION_PHASES
        )
        return (
            f"**Demo Mode** — Election phases:\n\n{phases_info}\n\n"
            "Set GEMINI_API_KEY for live responses with real-time phase data!"
        )

    # Default fallback
    _mock_counter += 1
    return _build_mock_system_preview()


# ── Pydantic schemas ───────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    session_id: str | None = None   # Optional; if None, a new session is created
    message: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    is_mock: bool = False
    query_type: str | None = None


class SuggestionsResponse(BaseModel):
    suggestions: list[str]
    categories: dict[str, list[str]]


# ── Simple inline text classifier for local fallback (no external deps) ────────
_CONCERN_KEYWORDS = {
    "infrastructure": ["wifi", "internet", "network", "infrastructure", "building", "lab", "equipment", "computer", "electricity", "power"],
    "academic": ["exam", "syllabus", "curriculum", "faculty", "teacher", "lecture", "class", "course", "grade", "assignment"],
    "campus_life": ["hostel", "sports", "cafeteria", "food", "canteen", "event", "festival", "club", "activity", "gym"],
    "administration": ["fee", "scholarship", "admission", "document", "office", "administration", "policy", "rule", "complaint", "helpdesk"],
    "other": ["other", "general", "misc", "suggestion", "feedback"],
}


def _classify_text(text: str) -> str:
    """Simple keyword-based text classification (no external dependencies)."""
    text_lower = text.lower()
    scores = {}
    for category, keywords in _CONCERN_KEYWORDS.items():
        scores[category] = sum(1 for kw in keywords if kw in text_lower)
    if max(scores.values()) == 0:
        return "other"
    return max(scores, key=scores.get)


_POSITIVE_WORDS = {"good", "great", "excellent", "amazing", "wonderful", "fantastic", "happy", "satisfied", "love", "best"}
_NEGATIVE_WORDS = {"bad", "poor", "terrible", "awful", "horrible", "worst", "angry", "frustrated", "slow", "disappointed", "hate", "waste"}


def _analyze_sentiment(text: str) -> float:
    """Simple keyword-based sentiment analysis."""
    text_lower = text.lower()
    words = set(text_lower.split())
    pos_count = len(words & _POSITIVE_WORDS)
    neg_count = len(words & _NEGATIVE_WORDS)
    total = pos_count + neg_count
    if total == 0:
        return 0.0
    return round((pos_count - neg_count) / total, 2)


# ── Suggested questions (grouped by category) ─────────────────────────────────
SUGGESTED_QUESTIONS = {
    "Candidates & Manifestos": [
        "Compare all candidates on their manifestos",
        "What are the main promises from each candidate?",
        "Who has plans for campus Wi-Fi improvements?",
        "Which candidate focuses on student welfare?",
        "Compare candidates on academic and infrastructure issues",
    ],
    "Voting Process": [
        "How do I register to vote?",
        "How does voting work?",
        "Is my vote anonymous?",
        "How is vote security maintained?",
        "Can I change my vote after submitting?",
    ],
    "Election Info": [
        "What are the top student concerns?",
        "What is the current election phase?",
        "Who can stand as a candidate?",
        "What positions are available?",
        "How are results announced?",
    ],
}

FLAT_SUGGESTIONS = [
    s for group in SUGGESTED_QUESTIONS.values() for s in group
]


# ── Helper: Build system instruction with dynamic context ──────────────────────

async def _build_contextual_instruction(db: Optional[AsyncSession] = None) -> str:
    """Build the system instruction with live election data and real DB candidates."""
    dynamic_ctx = {}
    candidate_data = None

    if db is not None:
        try:
            # Get the most recent election
            result = await db.execute(
                select(Election).order_by(Election.created_at.desc()).limit(1)
            )
            election = result.scalars().first()

            if election:
                dynamic_ctx["election_title"] = election.title

                # Get current phase
                current_phase = PhaseEngine.get_current_phase(election)
                dynamic_ctx["current_phase"] = current_phase

                # Get time remaining
                time_remaining = PhaseEngine.get_time_remaining(election, current_phase)
                if time_remaining:
                    dynamic_ctx["time_remaining"] = time_remaining

                # Get positions
                pos_result = await db.execute(
                    select(Position.title).where(Position.election_id == election.election_id)
                )
                positions = pos_result.scalars().all()
                if positions:
                    dynamic_ctx["positions"] = list(positions)

            # ── Fetch real approved candidates with manifestos ──────────────
            # Query: Candidate (APPROVED) → Voter (name, dept, year) → Manifesto (content)
            candidate_rows = await db.execute(
                select(
                    Candidate,
                    Voter.full_name,
                    Voter.department,
                    Voter.year_of_study,
                    Position.title.label("position_title"),
                    Manifesto.content.label("manifesto_content"),
                    Manifesto.image_url,
                )
                .join(Voter, Candidate.voter_id == Voter.voter_id)
                .join(Position, Candidate.position_id == Position.position_id)
                .outerjoin(
                    Manifesto,
                    and_(
                        Candidate.candidate_id == Manifesto.candidate_id,
                        Manifesto.status == "approved",
                    ),
                )
                .where(Candidate.status == CandidateStatusEnum.APPROVED)
            )
            rows = candidate_rows.all()

            if rows:
                candidate_data = {}
                for row in rows:
                    full_name = row.full_name
                    if full_name not in candidate_data:
                        candidate_data[full_name] = {
                            "position": row.position_title or "Unknown Position",
                            "department": row.department or "Unknown Department",
                            "year": f"{row.year_of_study or '?'} Year",
                            "party": "Independent",  # Will be updated if party data is available
                            "manifesto_content": row.manifesto_content,
                            "image_url": row.image_url,
                        }
                logger.info(f"Fetched {len(candidate_data)} real candidates from DB for AI context.")

        except Exception as e:
            logger.warning(f"Could not fetch dynamic context: {e}")

    return build_system_instruction(
        dynamic_context=format_dynamic_context(**dynamic_ctx) if dynamic_ctx else None,
        candidate_data=candidate_data,
    )


# ── Simple query type classifier ──────────────────────────────────────────────

def classify_query(message: str) -> str:
    """Simple keyword-based query type classification."""
    msg = message.lower().strip()

    # Candidate/manifesto queries
    # (Candidate name detection is handled by Gemini's NLP; keyword-based fallback here)
    if any(w in msg for w in ["manifesto", "platform", "stance", "promise", "compare", "candidate"]):
        return "manifesto"
    if any(w in msg for w in ["platforms", "running for", "tell me about"]):
        return "manifesto"

    # Voting process
    if any(w in msg for w in ["how to vote", "how do i vote", "cast vote", "voting process"]):
        return "voting_process"
    if any(w in msg for w in ["anonymous", "anonymity", "receipt", "hash"]):
        return "security"

    # Registration
    if any(w in msg for w in ["register", "registration", "sign up", "become a voter"]):
        return "registration"
    if any(w in msg for w in ["apply candidate", "become candidate", "stand for"]):
        return "candidate_info"

    # Election schedule
    if any(w in msg for w in ["phase", "schedule", "timeline", "when", "deadline"]):
        return "election_schedule"

    # Student concerns
    if any(w in msg for w in ["concern", "issue", "problem", "student want", "students want"]):
        return "student_concerns"

    # Security
    if any(w in msg for w in ["security", "tamper", "fraud", "safe", "secure"]):
        return "security"

    # Rules
    if any(w in msg for w in ["rule", "eligible", "can i vote", "who can", "requirement"]):
        return "rules"

    # Results
    if any(w in msg for w in ["result", "winner", "who won", "vote count", "tally"]):
        return "results"

    # General election queries
    if any(w in msg for w in ["election", "vote", "college", "student"]):
        return "voting_process"

    return "voting_process"  # Default to voting process


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/chat/suggestions", response_model=SuggestionsResponse)
async def get_suggestions():
    """Return suggested questions for the chatbot UI, grouped by category."""
    return SuggestionsResponse(
        suggestions=FLAT_SUGGESTIONS,
        categories=SUGGESTED_QUESTIONS,
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    """
    Multi-turn AI chatbot endpoint.

    - Creates a new Gemini chat session if session_id is None or unknown.
    - Maintains conversation history per session using Gemini's built-in chat management.
    - Injects dynamic election context (current phase, positions, etc.) into the system instruction.
    - Falls back to mock responses if the SDK is unavailable or API key is missing.
    """
    if not request.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty."
        )

    # Classify the query
    query_type = classify_query(request.message)

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
            query_type=query_type,
        )

    # ── Live Gemini mode ──────────────────────────────────────────────────────
    try:
        # Build the contextual system instruction with live election data
        instruction = await _build_contextual_instruction(db)

        # Get or create a Gemini Chat session for this session_id
        if session_id not in _chat_sessions or _chat_sessions[session_id] is None:
            chat_session = client.chats.create(
                model="gemini-2.5-flash",
                config=genai_types.GenerateContentConfig(
                    system_instruction=instruction,
                    temperature=0.3,        # Lower = more factual, less creative
                    max_output_tokens=1024,
                ),
            )
            _chat_sessions[session_id] = {"chat": chat_session, "instruction": instruction}
        else:
            chat_session = _chat_sessions[session_id]["chat"]

        # Send the user message and get the AI response
        response = chat_session.send_message(request.message)
        reply_text = response.text

        return ChatResponse(
            session_id=session_id,
            reply=reply_text,
            is_mock=False,
            query_type=query_type,
        )

    except Exception as e:
        logger.error(f"Gemini API error for session {session_id}: {e}")
        # On API error, return a safe fallback instead of crashing
        return ChatResponse(
            session_id=session_id,
            reply=(
                "I encountered an issue reaching the AI service. Please try again in a moment.\n\n"
                f"_(Error: {str(e)[:120]})_"
                "\n\n💡 **Tip:** Check your GEMINI_API_KEY in the .env file."
            ),
            is_mock=True,
            query_type=query_type,
        )


@router.delete("/chat/{session_id}", status_code=status.HTTP_200_OK)
async def clear_session(session_id: str):
    """Clear a specific chat session (e.g., on user logout or 'New Chat')."""
    if session_id in _chat_sessions:
        del _chat_sessions[session_id]
    return {"message": "Session cleared.", "session_id": session_id}


# ── Legacy stub endpoints (kept for backward compatibility) ────────────────────

@router.post("/classify")
async def classify_concern(request: ChatRequest):
    """Classify a student concern via the AI microservice."""
    from app.services.ai_proxy_service import AIProxyService
    proxy = AIProxyService()
    try:
        result = await proxy.classify_concern(request.message)
        logger.info(f"AI Proxy classify response: {result}")
        return result
    except Exception as e:
        logger.warning(f"AI Proxy classify failed, using local fallback: {e}")
        category = _classify_text(request.message)
        score = _analyze_sentiment(request.message)
        return {"category": category, "confidence": 0.75, "sentiment_score": score}


@router.post("/recommend")
async def get_recommendations(request: ChatRequest):
    """Get AI candidate recommendations based on a concern description."""
    from app.services.ai_proxy_service import AIProxyService
    proxy = AIProxyService()
    try:
        result = await proxy.get_recommendations([request.message])
        return {"recommendations": result}
    except Exception as e:
        logger.warning(f"AI Proxy recommend failed: {e}")
        # Return inline fallback with keyword-based matching
        theme = _classify_text(request.message)
        return {
            "recommendations": [{
                "candidate_id": "fallback",
                "match_score": 0.5,
                "matching_themes": [theme],
                "explanation": f"AI microservice unavailable. Based on keyword analysis, this concern relates to '{theme}'."
            }],
            "note": "Local fallback used"
        }


@router.post("/analyze-manifesto")
async def analyze_manifesto(request: ChatRequest):
    """Analyze a candidate manifesto via the AI microservice."""
    from app.services.ai_proxy_service import AIProxyService
    proxy = AIProxyService()
    try:
        result = await proxy.analyze_manifesto(request.message)
        return result
    except Exception as e:
        logger.warning(f"AI Proxy analyze-manifesto failed: {e}")
        return {"sentiment_score": 0.0, "feasibility_score": 0.0, "key_themes": [], "summary": "Analysis unavailable"}


@router.post("/analyze-pipeline")
async def run_pipeline(request: ChatRequest):
    """End-to-end analysis: classify -> sentiment -> recommend."""
    from app.services.ai_proxy_service import AIProxyService
    proxy = AIProxyService()
    text = request.message
    try:
        classification = await proxy.classify_concern(text)
        recommendations = await proxy.get_recommendations([text])
        return {
            "classification": classification,
            "recommendations": recommendations,
        }
    except Exception as e:
        logger.warning(f"AI Proxy pipeline failed, using local fallback: {e}")
        category = _classify_text(text)
        score = _analyze_sentiment(text)
        return {
            "classification": {"category": category, "confidence": 0.75, "sentiment_score": score},
            "recommendations": [],
            "note": "Local fallback used"
        }
