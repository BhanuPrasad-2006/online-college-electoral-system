import asyncio
import uuid
from app.db.session import engine
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.election import Election
from app.models.position import Position
from app.models.voter import Voter
from app.models.candidate import Candidate
from app.security.password_service import hash_password

async def seed():
    async with AsyncSession(engine) as db:
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        
        # Create a fake election
        election = Election(
            title="General Student Council Election 2026",
            description="Election for the student council.",
            status="UPCOMING",
            registration_start=now,
            registration_end=now + timedelta(days=7),
            voting_start=now + timedelta(days=14),
            voting_end=now + timedelta(days=15)
        )
        db.add(election)
        await db.flush()
        
        # Create a fake position
        position = Position(
            election_id=election.election_id,
            title="President",
            description="President of the Student Council"
        )
        db.add(position)
        await db.flush()
        
        # Hash the password
        password_hash = hash_password("bhanu@2006")
        
        # Create the voter profile for the candidate
        voter = Voter(
            student_id="1DS24CY005",
            full_name="Bhanu Prasad",
            college_email="1ds24cy05@dsce.edu.in",
            password_hash=password_hash,
            is_verified=True,  # Set to true so they can login
            department="CY",
            year_of_study=1
        )
        db.add(voter)
        await db.flush()
        
        # Create the candidate profile
        candidate = Candidate(
            voter_id=voter.voter_id,
            election_id=election.election_id,
            position_id=position.position_id,
            mobile_number="778018812",
            mobile_verified=True,
            status="APPROVED"
        )
        db.add(candidate)
        await db.commit()
        
        print("Fake data successfully created!")
        print(f"Election ID: {election.election_id}")
        print(f"Position ID: {position.position_id}")
        print(f"Voter/Candidate ID: {voter.voter_id}")
        print(f"Candidate Profile ID: {candidate.candidate_id}")
        print(f"Email: {voter.college_email}")
        print(f"Mobile: {candidate.mobile_number}")
        print(f"Password: bhanu@2006")

if __name__ == "__main__":
    asyncio.run(seed())
