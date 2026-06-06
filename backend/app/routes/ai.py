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

import asyncio
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
from app.enums.candidate_status import CandidateStatusEnum
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

def _format_candidate_summary(candidate_data: Optional[dict] = None) -> str:
    if not candidate_data:
        return "No candidates are currently available in the portal database."

    lines = []
    for name, info in candidate_data.items():
        position = info.get("position") or "Position not set"
        department = info.get("department") or "Department not set"
        year = info.get("year") or "Year not set"
        manifesto = info.get("manifesto_content")
        manifesto_note = "Manifesto submitted" if manifesto else "Manifesto not submitted"
        lines.append(f"- **{name}** — {position}, {department}, {year}. {manifesto_note}.")
    return "\n".join(lines)


def _status_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


async def _fetch_live_candidate_data(db: Optional[AsyncSession]) -> dict:
    if db is None:
        return {}

    try:
        query = (
            select(Candidate)
            .options(joinedload(Candidate.voter), joinedload(Candidate.position))
            .order_by(Candidate.applied_at.desc())
        )
        result = await db.execute(query)
        candidates = result.scalars().unique().all()

        candidate_data = {}
        for candidate in candidates:
            if _status_value(candidate.status) != CandidateStatusEnum.APPROVED.value:
                continue

            voter = candidate.voter
            position = candidate.position
            if not voter:
                continue

            manifesto_result = await db.execute(
                select(Manifesto).where(Manifesto.candidate_id == candidate.candidate_id)
            )
            manifesto = manifesto_result.scalar_one_or_none()

            year = f"{voter.year_of_study} Year" if voter.year_of_study else "Year not set"
            candidate_data[voter.full_name] = {
                "position": position.title if position else "Position not set",
                "department": voter.department or "Department not set",
                "year": year,
                "party": "Not specified",
                "status": _status_value(candidate.status),
                "manifesto_content": manifesto.content if manifesto and manifesto.content else None,
                "image_url": manifesto.image_url if manifesto else None,
            }

        return candidate_data
    except Exception as e:
        logger.warning("Could not fetch live candidate data for chatbot: %s", e)
        return {}


async def _mock_response(message: str, db: AsyncSession) -> str:
    message_lower = message.lower().strip()

    # 1. Fetch current election & phase
    election_res = await db.execute(select(Election).order_by(Election.created_at.desc()).limit(1))
    election = election_res.scalars().first()
    phase = "unknown"
    remaining_time = None
    if election:
        phase = PhaseEngine.get_current_phase(election)
        remaining_time = PhaseEngine.get_time_remaining(election, phase)

    # 2. Check for candidate/manifesto/compare queries
    if any(w in message_lower for w in ["candidate", "manifesto", "platform", "contest", "who is running", "running for", "compare"]):
        cands_res = await db.execute(
            select(Candidate)
            .options(joinedload(Candidate.voter), joinedload(Candidate.position))
            .where(Candidate.status == "APPROVED")
        )
        candidates = cands_res.scalars().all()
        if not candidates:
            return "There are currently no approved candidates registered for this election."
        
        reply = "**Registered Candidates & Manifestos:**\n\n"
        for c in candidates:
            if not c.voter:
                continue
            man_res = await db.execute(select(Manifesto).where(Manifesto.candidate_id == c.candidate_id))
            man = man_res.scalars().first()
            manifesto_txt = man.content if man else "No manifesto submitted yet."
            party_txt = f" ({c.party})" if hasattr(c, "party") and c.party else ""
            reply += f"• **{c.voter.full_name}**{party_txt}\n"
            reply += f"  - Running for: {c.position.title if c.position else 'Unknown'}\n"
            reply += f"  - Dept: {c.voter.department} · Sem: {c.voter.semester}\n"
            reply += f"  - Manifesto: {manifesto_txt[:300]}...\n\n"
        return reply

    # 3. Check for registration/voting queries
    if any(w in message_lower for w in ["register", "how to vote", "how do i vote", "voting process", "step"]):
        return (
            "**Voting & Registration Process:**\n\n"
            "1. **Registration**: When Candidate Registration is open, eligible students can register as candidates. Voters must have their profiles authorized by the election coordinator.\n"
            "2. **Identity Verification**: On voting day, go to the Vote portal and enter your 8-character Verification ID code.\n"
            "3. **Face Verification**: Complete the passive liveness check. Look at the camera while it captures a few frames to match against your student profile photo.\n"
            "4. **Ballot**: Choose your preferred candidate ticket or NOTA (None of the Above) on the ballot screen.\n"
            "5. **Cast Vote**: Click 'Cast Vote' to securely and anonymously record your vote in the database.\n"
            "All votes are cryptographically signed and stored in the audit logs."
        )

    # 4. Check for notices
    if any(w in message_lower for w in ["notice", "announcement", "broadcast", "official notice"]):
        from app.models.notice import Notice
        notices_res = await db.execute(select(Notice).order_by(Notice.created_at.desc()).limit(5))
        notices = notices_res.scalars().all()
        if not notices:
            return "There are no official notices published by the election commission yet."
        
        reply = "**Recent Official Notices:**\n\n"
        for n in notices:
            reply += f"• **{n.title}** ({n.created_at.strftime('%b %d, %Y') if n.created_at else 'Recent'})\n"
            reply += f"  {n.content[:200]}...\n\n"
        return reply

    # 5. Check for concerns
    if any(w in message_lower for w in ["concern", "issue", "complaint", "student concern", "feedback"]):
        concerns_res = await db.execute(select(Concern))
        concerns = concerns_res.scalars().all()
        if not concerns:
            return "No student concerns have been logged in the system yet."
        
        from collections import defaultdict
        groups = defaultdict(int)
        for c in concerns:
            cat_val = c.category.value if hasattr(c.category, "value") else c.category
            groups[cat_val] += 1
            
        reply = f"**Student Concerns Summary ({len(concerns)} total):**\n\n"
        for cat, cnt in groups.items():
            display_cat = cat.replace("_", " ").title()
            reply += f"• **{display_cat}**: {cnt} logged concern(s)\n"
        reply += "\nStudents can submit their concerns via the voter portal, which are analyzed by AI to help candidates shape their manifestos."
        return reply

    # 6. Check for phase/timeline/schedule
    if any(w in message_lower for w in ["phase", "schedule", "timeline", "when", "date", "status"]):
        if not election:
            return "No election is currently configured in the system."
        
        reply = f"**Election Phase & Timeline:**\n\n"
        reply += f"• **Current Phase**: {phase.replace('_', ' ').upper()}\n"
        if remaining_time:
            reply += f"• **Time Remaining**: {remaining_time}\n"
        reply += f"• **Registration Period**: {election.registration_start.strftime('%b %d, %Y') if election.registration_start else 'N/A'} to {election.registration_end.strftime('%b %d, %Y') if election.registration_end else 'N/A'}\n"
        reply += f"• **Voting Period**: {election.voting_start.strftime('%b %d, %Y') if election.voting_start else 'N/A'} to {election.voting_end.strftime('%b %d, %Y') if election.voting_end else 'N/A'}\n"
        return reply

    # Default fallback
    reply = (
        "I am your CollegeVote Assistant. I can help you with questions about candidates, voting rules, schedules, and student concerns.\n\n"
    )
    if election:
        reply += f"The current election is **{election.title}** and the active phase is **{phase.replace('_', ' ').upper()}**.\n\n"
    
    reply += (
        "**Try asking me:**\n"
        "• Who is running in this election?\n"
        "• What are the steps to cast a vote?\n"
        "• Show recent notices\n"
        "• What concerns have students reported?"
    )
    return reply


def _is_transient_gemini_error(error: Exception) -> bool:
    text = str(error).lower()
    transient_markers = (
        "503",
        "unavailable",
        "high demand",
        "overloaded",
        "temporarily",
        "rate limit",
        "resource exhausted",
        "deadline exceeded",
        "timeout",
    )
    return any(marker in text for marker in transient_markers)


def _format_gemini_fallback(error: Exception) -> str:
    if _is_transient_gemini_error(error):
        return (
            "The live AI model is temporarily busy. I can still help with election rules, "
            "candidate information, voting steps, and student concerns using the portal's built-in knowledge.\n\n"
            "**Voting help:** Log in with your college email, complete OTP verification, open the voting page "
            "during the active voting phase, review the candidates, and submit your vote once. Your submitted "
            "vote cannot be changed."
        )

    return (
        "I encountered an issue reaching the live AI service. I can still answer basic election questions "
        "from the portal's built-in knowledge while the live model is unavailable.\n\n"
        f"_(Error: {str(error)[:120]})_"
    )


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
        "Tell me about a candidate's platform",
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

async def _build_contextual_instruction(
    db: Optional[AsyncSession] = None,
    candidate_data: Optional[dict] = None,
) -> str:
    """Build the system instruction with live election data if available."""
    dynamic_ctx = {}
    candidate_data = {}

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

            # Query approved candidates
            from app.models.candidate import Candidate
            from app.models.manifesto import Manifesto

            cands_res = await db.execute(
                select(Candidate)
                .options(
                    joinedload(Candidate.voter),
                    joinedload(Candidate.position)
                )
                .where(Candidate.status == "APPROVED")
            )
            approved_candidates = cands_res.scalars().all()

            for cand in approved_candidates:
                if not cand.voter:
                    continue
                name = cand.voter.full_name

                # Fetch manifesto
                man_res = await db.execute(
                    select(Manifesto).where(Manifesto.candidate_id == cand.candidate_id)
                )
                man = man_res.scalars().first()

                candidate_data[name] = {
                    "position": cand.position.title if cand.position else "Unknown",
                    "department": cand.voter.department or "Unknown",
                    "year": f"{cand.voter.year_of_study}rd Year" if cand.voter.year_of_study else "Unknown",
                    "party": "Independent",
                    "manifesto_content": man.content if man else None,
                    "image_url": man.image_url if man else None,
                }

        except Exception as e:
            logger.warning(f"Could not fetch dynamic context: {e}")

    return build_system_instruction(
        dynamic_context=format_dynamic_context(**dynamic_ctx) if dynamic_ctx else None,
        candidate_data=candidate_data if candidate_data else None,
    )


# ── Simple query type classifier ──────────────────────────────────────────────

def classify_query(message: str, candidate_data: Optional[dict] = None) -> str:
    """Simple keyword-based query type classification."""
    msg = message.lower().strip()

    # Candidate/manifesto queries
    source = candidate_data if candidate_data else CANDIDATE_MANIFESTOS
    candidate_names = [n.lower().split()[0] for n in source.keys()]
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

    candidate_data = await _fetch_live_candidate_data(db)

    # Classify the query
    query_type = classify_query(request.message, candidate_data)

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
            reply=await _mock_response(request.message, db),
            is_mock=True,
            query_type=query_type,
        )

    # ── Live Gemini mode ──────────────────────────────────────────────────────
    try:
        # Build the contextual system instruction with live election data
        instruction = await _build_contextual_instruction(db, candidate_data)

        # Get or create a Gemini Chat session for this session_id
        if (
            session_id not in _chat_sessions
            or _chat_sessions[session_id] is None
            or _chat_sessions[session_id].get("instruction") != instruction
        ):
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

        # Send the user message and get the AI response. Gemini can occasionally
        # return transient 503/high-demand errors, so retry once with a fresh chat.
        try:
            response = await asyncio.to_thread(chat_session.send_message, request.message)
        except Exception as first_error:
            if not _is_transient_gemini_error(first_error):
                raise

            logger.warning(
                "Transient Gemini error for session %s; retrying once with a fresh chat: %s",
                session_id,
                first_error,
            )
            chat_session = client.chats.create(
                model="gemini-2.5-flash",
                config=genai_types.GenerateContentConfig(
                    system_instruction=instruction,
                    temperature=0.3,
                    max_output_tokens=1024,
                ),
            )
            _chat_sessions[session_id] = {"chat": chat_session, "instruction": instruction}
            response = await asyncio.to_thread(chat_session.send_message, request.message)

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
            reply=_format_gemini_fallback(e),
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

