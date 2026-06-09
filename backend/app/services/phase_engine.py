from datetime import datetime, timezone
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.election import Election
from app.models.election_phase import ElectionPhase
from app.enums.election_status import ElectionStatusEnum

PHASE_ORDER = [
    "pre_registration",
    "registration_open",
    "registration_closed",
    "campaign_period",
    "voting_open",
    "voting_closed",
    "results_announced"
]


class PhaseEngine:
    @staticmethod
    def _normalize(dt):
        if dt is None:
            return None
        if dt.tzinfo is not None:
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt

    @staticmethod
    def get_current_phase(election: Election, current_time: datetime = None) -> str:
        """
        Calculate the current phase of the election based on its dates and document_deadline.

        IMPORTANT: When an admin explicitly sets the election status (e.g. "Force Open Voting"),
        the explicit status overrides date-based logic. This prevents stale `voting_end` dates
        from blocking voting after a manual override.
        """
        n = PhaseEngine._normalize
        now = n(current_time or datetime.now(timezone.utc))
        reg_start = n(election.registration_start)
        reg_end = n(election.registration_end)
        doc_dl = n(election.document_deadline)
        vote_start = n(election.voting_start)
        vote_end = n(election.voting_end)

        if election.is_paused:
            return "paused"
        if election.status == ElectionStatusEnum.RESULTS_PUBLISHED.value:
            return "results_announced"

        # ── Explicit status override ───────────────────────────────────
        # If the admin has explicitly set the status to VOTING_OPEN or CLOSED,
        # respect that over date-based logic (handles Force Open/Close Voting).
        # BUT only if the dates are inconsistent – if dates are normal, prefer
        # date-based logic.

        if election.status == ElectionStatusEnum.VOTING_OPEN.value:
            # Check if dates would agree or disagree
            if vote_start and vote_end:
                if vote_start <= now < vote_end:
                    return "voting_open"        # dates agree
                if now >= vote_end:
                    # Even if status is open, if the time is past vote_end, it's closed
                    return "voting_closed"
            # voting_end is None or dates are missing → respect admin status
            return "voting_open"

        if election.status == ElectionStatusEnum.CLOSED.value:
            # Respect admin's close decision even if dates say otherwise
            return "voting_closed"

        # 1. Pre-registration
        if reg_start and now < reg_start:
            return "pre_registration"

        # 2. Registration open
        if reg_start and reg_end and reg_start <= now < reg_end:
            return "registration_open"

        # 3. Post-registration phases (registration_closed / campaign_period)
        if reg_end and now >= reg_end:
            # 3a. Registration closed (document submission period)
            if doc_dl and now < doc_dl:
                return "registration_closed"
            # 3b. Campaign period (before voting starts)
            if vote_start and now < vote_start:
                return "campaign_period"
            if not vote_start:
                # No voting_start set — stay in registration_closed if doc_dl not reached
                if doc_dl and now < doc_dl:
                    return "registration_closed"
                return "campaign_period"
            # If we're past vote_start, fall through to voting checks

        # 4. Voting (date-based)
        if vote_start and vote_end:
            if vote_start <= now < vote_end:
                return "voting_open"
            if now >= vote_end:
                return "voting_closed"

        # 5. Status fallback (no valid dates configured)
        if election.status == ElectionStatusEnum.VOTING_OPEN.value:
            return "voting_open"
        if election.status == ElectionStatusEnum.CLOSED.value:
            return "voting_closed"

        return "unknown"

    @staticmethod
    def get_next_phase(current_phase: str) -> str:
        if current_phase in PHASE_ORDER:
            idx = PHASE_ORDER.index(current_phase)
            if idx + 1 < len(PHASE_ORDER):
                return PHASE_ORDER[idx + 1]
        return None

    @staticmethod
    def get_time_remaining(election: Election, current_phase: str, current_time: datetime = None) -> str:
        n = PhaseEngine._normalize
        current_time = n(current_time or datetime.now(timezone.utc))
        reg_start = n(election.registration_start)
        reg_end = n(election.registration_end)
        doc_dl = n(election.document_deadline)
        vote_start = n(election.voting_start)
        vote_end = n(election.voting_end)
            
        if current_phase == "pre_registration" and reg_start:
            delta = reg_start - current_time
            return PhaseEngine._format_timedelta(delta)
            
        if current_phase == "registration_open" and reg_end:
            delta = reg_end - current_time
            return PhaseEngine._format_timedelta(delta)
            
        if current_phase == "registration_closed":
            doc_deadline = PhaseEngine._normalize(election.document_deadline)
            if doc_deadline and doc_deadline > current_time:
                delta = doc_deadline - current_time
                return PhaseEngine._format_timedelta(delta)
            # Fallback to vote_start if no document_deadline
            if vote_start and vote_start > current_time:
                delta = vote_start - current_time
                return PhaseEngine._format_timedelta(delta)
            
        if current_phase == "campaign_period" and vote_start:
            delta = vote_start - current_time
            return PhaseEngine._format_timedelta(delta)
            
        if current_phase == "voting_open" and vote_end:
            delta = vote_end - current_time
            return PhaseEngine._format_timedelta(delta)
            
        return None

    @staticmethod
    def _format_timedelta(delta) -> str:
        if delta.total_seconds() <= 0:
            return "0s"
        days = delta.days
        hours, remainder = divmod(delta.seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        
        parts = []
        if days > 0: parts.append(f"{days}d")
        if hours > 0: parts.append(f"{hours}h")
        if minutes > 0: parts.append(f"{minutes}m")
        if seconds > 0 and days == 0: parts.append(f"{seconds}s")
        
        return " ".join(parts) if parts else "0s"

    @staticmethod
    def is_voting_allowed(election: Election) -> bool:
        phase = PhaseEngine.get_current_phase(election)
        return phase == "voting_open"

    @staticmethod
    def is_election_status_voting_open(election: Election) -> bool:
        """Check the raw election.status field directly (bypasses PhaseEngine)."""
        return election.status == ElectionStatusEnum.VOTING_OPEN.value
        
    @staticmethod
    def is_registration_allowed(election: Election) -> bool:
        return PhaseEngine.get_current_phase(election) == "registration_open"
        
    @staticmethod
    def is_manifesto_edit_allowed(election: Election) -> bool:
        phase = PhaseEngine.get_current_phase(election)
        return phase in ["registration_open", "registration_closed"]

    @staticmethod
    def is_document_submission_allowed(election: Election) -> bool:
        """Document/manifesto uploads allowed during registration and registration_closed phases."""
        phase = PhaseEngine.get_current_phase(election)
        return phase in ["registration_open", "registration_closed"]
