import asyncio
import httpx
import html
import jwt
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.voter import Voter
from app.models.position import Position
from app.models.candidate import Candidate
from app.models.manifesto import Manifesto
from app.models.audit_log import AuditLog
from app.models.election import Election
from app.core.config import settings
from app.enums.election_status import ElectionStatusEnum
from datetime import datetime, timezone, timedelta
import uuid

async def main():
    # Save original election settings
    async with SessionLocal() as db:
        res_elec = await db.execute(select(Election).order_by(Election.created_at.desc()))
        election = res_elec.scalars().first()
        assert election is not None, "No election found in database"
        
        orig_status = election.status
        orig_reg_start = election.registration_start
        orig_reg_end = election.registration_end
        
        # Temp open registration window
        election.status = ElectionStatusEnum.REGISTRATION_OPEN.value
        election.registration_start = datetime.now(timezone.utc) - timedelta(days=1)
        election.registration_end = datetime.now(timezone.utc) + timedelta(days=1)
        db.add(election)
        await db.commit()
        print("TEMPORARY: Election registration window opened.")

    try:
        async with httpx.AsyncClient(base_url="http://127.0.0.1:8000/api/v1", timeout=30.0) as client:
            print("\n=== TEST 1: Check existing voter Nithin (should be eligible) ===")
            payload = {
                "email": "1ds24cy026@dsce.edu.in",
                "mobile_number": "9008464001"
            }
            r = await client.post("/auth/candidate/check", json=payload)
            print("Check status code:", r.status_code)
            res = r.json()
            print("Check response:", res)
            assert r.status_code == 200
            assert res["status"] == "eligible"
            token = res["token"]

            print("\n=== TEST 2: Fetch a valid position ID from database ===")
            async with SessionLocal() as db:
                pos_res = await db.execute(select(Position).limit(1))
                position = pos_res.scalars().first()
                assert position is not None, "No position found in DB"
                position_id = str(position.position_id)
                print("Selected Position ID:", position_id, "Title:", position.title)

            print("\n=== TEST 3: Attempt to register with a non-existent voter token ===")
            # We craft a token with a non-existent voter ID to verify that auto-creation is removed
            bad_voter_uuid = uuid.uuid4()
            expire = datetime.now(timezone.utc) + timedelta(minutes=10)
            bad_payload = {
                "sub": str(bad_voter_uuid),
                "email": "nonexistent@dsce.edu.in",
                "mobile_number": "9999999999",
                "year_of_study": 3,
                "type": "candidate_eligibility_session",
                "exp": expire,
            }
            bad_token = jwt.encode(bad_payload, settings.JWT_SECRET_KEY, algorithm="HS256")
            
            reg_payload_bad = {
                "otp_session_token": bad_token,
                "position_id": position_id,
                "party_name": "Test Party",
                "mobile_number": "9999999999",
                "new_password": "Password123!",
                "full_name": "Nonexistent Student",
                "department": "CSE",
                "student_id": "1DS24CY999"
            }
            r_bad = await client.post("/candidates/register", json=reg_payload_bad)
            print("Bad registration status code:", r_bad.status_code)
            print("Bad registration response:", r_bad.json())
            assert r_bad.status_code == 400
            assert "Voter profile not found" in r_bad.json()["detail"]
            print("SUCCESS: Non-existent voter creation rejected correctly!")

            print("\n=== TEST 4: Register Nithin with HTML tags in fields (to test XSS escaping) ===")
            xss_full_name = "Nithin <b>XSS</b>"
            xss_department = "CSE <b>XSS</b>"
            xss_student_id = "USN<b>X"
            xss_party_name = "Party <b>XSS</b>"
            xss_party_symbol_url = "http://example.com/logo.png?param=<b>"
            xss_manifesto = "Manifesto: <b>XSS</b>"
            
            reg_payload = {
                "otp_session_token": token,
                "position_id": position_id,
                "party_name": xss_party_name,
                "mobile_number": "9008464001",
                "new_password": "Password123!",
                "full_name": xss_full_name,
                "department": xss_department,
                "student_id": xss_student_id,
                "party_symbol_url": xss_party_symbol_url,
                "manifesto": xss_manifesto
            }
            
            r_reg = await client.post("/candidates/register", json=reg_payload)
            print("Register status code:", r_reg.status_code)
            print("Register response:", r_reg.json())
            assert r_reg.status_code == 201
            candidate_id = r_reg.json()["candidate_id"]

            print("\n=== TEST 5: Query Database directly to verify HTML escaping ===")
            async with SessionLocal() as db:
                # Check voter
                voter_res = await db.execute(select(Voter).where(Voter.college_email == "1ds24cy026@dsce.edu.in"))
                voter = voter_res.scalar_one_or_none()
                assert voter is not None
                print("DB Voter Full Name:", voter.full_name)
                print("DB Voter Department:", voter.department)
                print("DB Voter Student ID:", voter.student_id)
                assert "<b>" not in voter.full_name
                assert "&lt;b&gt;" in voter.full_name
                assert "<b>" not in voter.department
                assert "&lt;b&gt;" in voter.department
                assert "<b>" not in voter.student_id
                assert "&lt;b&gt;" in voter.student_id
                
                # Check candidate
                cand_res = await db.execute(select(Candidate).where(Candidate.voter_id == voter.voter_id))
                candidate = cand_res.scalar_one_or_none()
                assert candidate is not None
                print("DB Candidate Party Symbol URL:", candidate.party_symbol_url)
                assert "<b>" not in candidate.party_symbol_url
                assert "&lt;b&gt;" in candidate.party_symbol_url

                # Check manifesto
                man_res = await db.execute(select(Manifesto).where(Manifesto.candidate_id == candidate.candidate_id))
                manifesto = man_res.scalar_one_or_none()
                assert manifesto is not None
                print("DB Manifesto Content:", manifesto.content)
                assert "<b>" not in manifesto.content
                assert "&lt;b&gt;" in manifesto.content

                # Check audit log
                # Order by created_at desc to get the candidate applied log
                audit_res = await db.execute(
                    select(AuditLog)
                    .where(AuditLog.actor_id == voter.voter_id)
                    .order_by(AuditLog.created_at.desc())
                )
                audit_entry = audit_res.scalars().first()
                assert audit_entry is not None
                print("DB Audit Log Description:", audit_entry.description)
                assert "<b>" not in audit_entry.description
                assert "&lt;b&gt;" in audit_entry.description

                print("\nSUCCESS: All inputs correctly escaped in the database!")

                # Cleanup Candidate
                await db.delete(manifesto)
                await db.delete(candidate)
                await db.delete(audit_entry)
                
                # Reset voter Nithin to original unescaped state
                voter.full_name = "Nithin"
                voter.department = "CSE"
                voter.student_id = "1DS24CY026"
                db.add(voter)
                await db.commit()
                print("Cleanup and voter reset completed.")

        print("\nALL TEST CASES PASSED SUCCESSFULLY!")

    finally:
        # Restore original election settings
        async with SessionLocal() as db:
            res_elec = await db.execute(select(Election).order_by(Election.created_at.desc()))
            election = res_elec.scalars().first()
            if election:
                election.status = orig_status
                election.registration_start = orig_reg_start
                election.registration_end = orig_reg_end
                db.add(election)
                await db.commit()
                print("RESTORED: Original election settings restored.")

if __name__ == "__main__":
    asyncio.run(main())
