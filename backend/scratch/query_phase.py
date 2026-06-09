import asyncio
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.election import Election
from app.services.phase_engine import PhaseEngine

async def main():
    async with SessionLocal() as db:
        res = await db.execute(select(Election).order_by(Election.created_at.desc()))
        election = res.scalars().first()
        if election:
            print("Election ID:", election.election_id)
            print("Status:", election.status)
            print("Is Paused:", election.is_paused)
            print("Results Published:", election.results_published)
            phase = PhaseEngine.get_current_phase(election)
            print("Calculated Phase:", phase)
        else:
            print("No election found.")

if __name__ == "__main__":
    asyncio.run(main())
