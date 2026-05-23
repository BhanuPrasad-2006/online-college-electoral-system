import asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.election import Election
from app.models.election_phase import ElectionPhase
from app.services.phase_engine import PhaseEngine
from app.routes.election import notify_voting_started, notify_results_published, notify_registration_open
from app.utils.logger import logger

async def _check_and_transition_phases():
    """Evaluate current phases and trigger notifications if they changed."""
    async with SessionLocal() as db:
        # Get active election
        result = await db.execute(select(Election).order_by(Election.created_at.desc()))
        election = result.scalars().first()
        
        if not election or election.is_paused or not election.auto_transition:
            return
            
        current_phase_name = PhaseEngine.get_current_phase(election)
        
        # We store the active phase in ElectionPhase to detect edges (transitions)
        # Find the currently active DB phase
        phase_res = await db.execute(
            select(ElectionPhase).where(ElectionPhase.election_id == election.election_id, ElectionPhase.is_active == True)
        )
        active_db_phase = phase_res.scalars().first()
        
        if not active_db_phase or active_db_phase.phase_name != current_phase_name:
            # Transition occurred!
            logger.info(f"Phase Transition Detected: {active_db_phase.phase_name if active_db_phase else 'None'} -> {current_phase_name}")
            
            # Deactivate old phase
            if active_db_phase:
                active_db_phase.is_active = False
                
            # Create or activate new phase record
            new_phase_res = await db.execute(
                select(ElectionPhase).where(
                    ElectionPhase.election_id == election.election_id, 
                    ElectionPhase.phase_name == current_phase_name
                )
            )
            new_phase = new_phase_res.scalars().first()
            if not new_phase:
                new_phase = ElectionPhase(
                    election_id=election.election_id,
                    phase_name=current_phase_name,
                    start_time=datetime.now(timezone.utc),
                    is_active=True
                )
                db.add(new_phase)
            else:
                new_phase.is_active = True
                
            await db.commit()
            
            # Trigger notifications
            await trigger_phase_notifications(election, current_phase_name)


async def trigger_phase_notifications(election: Election, new_phase: str):
    """Trigger specific emails based on the phase transition."""
    # Note: currently reusing existing notify functions for voting/results.
    # We will add notify_election_announced or notify_registration_open here.
    if new_phase == "voting_open":
        await notify_voting_started(election.title)
    elif new_phase == "results_announced":
        await notify_results_published(election.title)
    elif new_phase == "registration_open":
        await notify_registration_open(election.title)
    
    
async def run_phase_scheduler():
    """Infinite loop to run in the background."""
    logger.info("Starting background Phase Engine Scheduler...")
    while True:
        try:
            await _check_and_transition_phases()
        except Exception as e:
            logger.error(f"Error in Phase Engine Scheduler: {e}")
            
        await asyncio.sleep(60) # Poll every 60 seconds
