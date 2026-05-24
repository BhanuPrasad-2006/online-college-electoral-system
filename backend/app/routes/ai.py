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
from sqlalchemy import select

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
from app.services.phase_engine import PhaseEngine
from app.api.deps import get_current_user
from app.models.candidate import Candidate
from app.models.concern import Concern
from app.models.manifesto import Manifesto
from app.services.ai_proxy_service import AIProxyService
from sqlalchemy.orm import joinedload

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


# ── Suggested questions (grouped by category) ─────────────────────────────────
SUGGESTED_QUESTIONS = {
    "Candidates & Manifestos": [
        "Compare all candidates on Wi-Fi improvements",
        "Tell me about Arjun Mehta's platform",
        "Who has plans for mental health support?",
        "Which candidate focuses on sports facilities?",
        "Compare candidates on cafeteria improvements",
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
    """Build the system instruction with live election data if available."""
    dynamic_ctx = {}

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

        except Exception as e:
            logger.warning(f"Could not fetch dynamic context: {e}")

    return build_system_instruction(
        dynamic_context=format_dynamic_context(**dynamic_ctx) if dynamic_ctx else None
    )


# ── Simple query type classifier ──────────────────────────────────────────────

def classify_query(message: str) -> str:
    """Simple keyword-based query type classification."""
    msg = message.lower().strip()

    # Candidate/manifesto queries
    candidate_names = [n.lower().split()[0] for n in CANDIDATE_MANIFESTOS.keys()]
    if any(name in msg for name in candidate_names):
        return "manifesto"
    if any(w in msg for w in ["manifesto", "platform", "stance", "promise", "compare", "candidate"]):
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


@router.get("/concern-categories", response_model=list[dict])
async def get_concern_categories(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get aggregated concern categories for the logged-in candidate's election.
    Runs gap analysis against the candidate's manifesto via the AI microservice.
    """
    user_id_str = current_user.get("user_id")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized"
        )
        
    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid UUID format"
        )
        
    # Fetch candidate profile using user_uuid
    query = (
        select(Candidate)
        .options(
            joinedload(Candidate.voter),
            joinedload(Candidate.position)
        )
        .where(Candidate.candidate_id == user_uuid)
    )
    res = await db.execute(query)
    candidate = res.scalar_one_or_none()
    
    if not candidate:
        query = (
            select(Candidate)
            .options(
                joinedload(Candidate.voter),
                joinedload(Candidate.position)
            )
            .where(Candidate.voter_id == user_uuid)
        )
        res = await db.execute(query)
        candidate = res.scalar_one_or_none()
        
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate profile not found"
        )

    # Fetch concerns for this candidate's election
    from sqlalchemy import cast
    from sqlalchemy.dialects.postgresql import UUID as PgUUID
    concerns_query = select(Concern).where(cast(Concern.election_id, PgUUID) == candidate.election_id)
    concerns_res = await db.execute(concerns_query)
    concerns = concerns_res.scalars().all()

    # If no concerns, return an empty list (DO NOT return mock data)
    if not concerns:
        return []

    # Group concerns by category
    from collections import defaultdict
    category_groups = defaultdict(list)
    for concern in concerns:
        cat_val = concern.category.value if hasattr(concern.category, "value") else concern.category
        if cat_val:
            category_groups[cat_val].append(concern)

    # Define display names mapping
    DISPLAY_NAMES = {
        "academic": "Academic",
        "infrastructure": "Infrastructure",
        "campus_life": "Campus Life",
        "administration": "Administration",
        "other": "Other"
    }

    # Prepare category details
    categories_to_analyze = []
    category_data = []

    for cat_val, category_concerns in category_groups.items():
        display_name = DISPLAY_NAMES.get(cat_val.lower(), cat_val.replace("_", " ").title())
        categories_to_analyze.append(display_name)
        
        total_cnt = len(category_concerns)
        pos_cnt = 0
        neg_cnt = 0
        neu_cnt = 0
        for c in category_concerns:
            s_val = c.sentiment.value if hasattr(c.sentiment, "value") else c.sentiment
            if s_val == "positive":
                pos_cnt += 1
            elif s_val == "negative":
                neg_cnt += 1
            else:
                neu_cnt += 1
                
        pos_pct = round((pos_cnt / total_cnt) * 100) if total_cnt > 0 else 0
        neu_pct = round((neu_cnt / total_cnt) * 100) if total_cnt > 0 else 0
        neg_pct = 100 - pos_pct - neu_pct if total_cnt > 0 else 0
        
        category_data.append({
            "name": display_name,
            "mentions": total_cnt,
            "positive": pos_pct,
            "neutral": neu_pct,
            "negative": neg_pct,
            "covered": False  # default, updated after AI analysis
        })

    # Fetch candidate's manifesto
    manifesto_query = select(Manifesto).where(Manifesto.candidate_id == candidate.candidate_id)
    manifesto_res = await db.execute(manifesto_query)
    manifesto_record = manifesto_res.scalars().first()
    manifesto_content = manifesto_record.content if manifesto_record else ""

    # Call AI service for gap analysis if we have categories
    if categories_to_analyze:
        try:
            ai_proxy = AIProxyService()
            gap_response = await ai_proxy.analyze_gaps(manifesto_content, categories_to_analyze)
            coverages = gap_response.get("coverages", [])
            coverages_map = {item["category_name"].lower(): item["covered"] for item in coverages if isinstance(item, dict)}
            
            # Update covered field in category_data
            for cat in category_data:
                cat["covered"] = coverages_map.get(cat["name"].lower(), False)
        except Exception as e:
            logger.error(f"Error calling analyze_gaps in AI service: {e}")

    return category_data

