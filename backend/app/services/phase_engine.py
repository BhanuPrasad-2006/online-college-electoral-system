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
    def get_current_phase(election: Election, current_time: datetime = None) -> str:
        """Calculate the current phase of the election based on its dates."""
        def normalize_dt(dt):
            if dt is None:
                return None
            if dt.tzinfo is not None:
                return dt.astimezone(timezone.utc).replace(tzinfo=None)
            return dt

        current_time = normalize_dt(current_time or datetime.now(timezone.utc))
        reg_start = normalize_dt(election.registration_start)
        reg_end = normalize_dt(election.registration_end)
        vote_start = normalize_dt(election.voting_start)
        vote_end = normalize_dt(election.voting_end)

        if election.is_paused:
            return "paused"
            
        if election.status == ElectionStatusEnum.RESULTS_PUBLISHED.value:
            return "results_announced"
            
        # Check explicit dates
        if reg_start and reg_end:
            if current_time < reg_start:
                return "pre_registration"
            if reg_start <= current_time < reg_end:
                return "registration_open"
                
        # If we passed registration end, but haven't hit voting start
        if reg_end and vote_start:
            if reg_end <= current_time < vote_start:
                # We can split this into registration_closed and campaign_period,
                # but campaign_period is the practical phase here.
                return "campaign_period"
                
        if vote_start and vote_end:
            if vote_start <= current_time < vote_end:
                return "voting_open"
            if current_time >= vote_end:
                return "voting_closed"
                
        # Fallback if dates are missing but status is set manually
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
        def normalize_dt(dt):
            if dt is None:
                return None
            if dt.tzinfo is not None:
                return dt.astimezone(timezone.utc).replace(tzinfo=None)
            return dt

        current_time = normalize_dt(current_time or datetime.now(timezone.utc))
        reg_start = normalize_dt(election.registration_start)
        reg_end = normalize_dt(election.registration_end)
        vote_start = normalize_dt(election.voting_start)
        vote_end = normalize_dt(election.voting_end)
            
        if current_phase == "pre_registration" and reg_start:
            delta = reg_start - current_time
            return PhaseEngine._format_timedelta(delta)
            
        if current_phase == "registration_open" and reg_end:
            delta = reg_end - current_time
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
        return PhaseEngine.get_current_phase(election) == "voting_open"
        
    @staticmethod
    def is_registration_allowed(election: Election) -> bool:
        return PhaseEngine.get_current_phase(election) == "registration_open"
        
    @staticmethod
    def is_manifesto_edit_allowed(election: Election) -> bool:
        phase = PhaseEngine.get_current_phase(election)
        return phase in ["registration_open", "campaign_period"]
