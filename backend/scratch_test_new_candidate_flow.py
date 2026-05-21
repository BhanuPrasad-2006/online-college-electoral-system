import asyncio
import httpx
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.voter import Voter
from app.models.position import Position
from app.models.audit_log import AuditLog
from app.models.candidate import Candidate

async def main():
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000/api/v1", timeout=30.0) as client:
        print("\n=== TEST 1: Check existing eligible voter in DB (Case B) ===")
        # Bhanu Prasad Eligible is a 3rd year voter
        payload = {
            "email": "1ds24cy015@dsce.edu.in",
            "mobile_number": "9876543210"
        }
        r = await client.post("/auth/candidate/check", json=payload)
        print("Status Code:", r.status_code)
        res = r.json()
        print("Response:", res)
        assert res["status"] == "eligible", "Test 1 failed: Status should be eligible"
        assert "token" in res, "Test 1 failed: Token missing"
        assert res["voter_details"]["full_name"] == "Bhanu Prasad Eligible", "Test 1 failed: Name mismatch"

        print("\n=== TEST 2: Check new candidate college email not in DB (Case C) ===")
        payload = {
            "email": "newstudent@college.edu.in",
            "mobile_number": "9900990099"
        }
        r = await client.post("/auth/candidate/check", json=payload)
        print("Status Code:", r.status_code)
        res = r.json()
        print("Response:", res)
        assert res["status"] == "need_year", "Test 2 failed: Status should be need_year"

        print("\n=== TEST 3: Check ineligible domain email (Case D) ===")
        payload = {
            "email": "student@gmail.com",
            "mobile_number": "9900990088"
        }
        r = await client.post("/auth/candidate/check", json=payload)
        print("Status Code:", r.status_code)
        res = r.json()
        print("Response:", res)
        assert res["status"] == "ineligible", "Test 3 failed: Status should be ineligible"
        assert "Invalid college email" in res["reason"], "Test 3 failed: Incorrect reason"

        print("\n=== TEST 4: Check ineligible voter year 2nd year (Case D) ===")
        payload = {
            "email": "1ds24ai057@dsce.edu.in", # DHANUSH THOTA (2nd year)
            "mobile_number": "8618947259"
        }
        r = await client.post("/auth/candidate/check", json=payload)
        print("Status Code:", r.status_code)
        res = r.json()
        print("Response:", res)
        assert res["status"] == "ineligible", "Test 4 failed: Status should be ineligible"
        assert "Only 3rd and 4th year" in res["reason"], "Test 4 failed: Incorrect reason"

        print("\n=== TEST 5: Initiate registration for 3rd/4th year (Case C) ===")
        payload = {
            "email": "newstudent@college.edu.in",
            "mobile_number": "9900990099",
            "year_of_study": 3
        }
        r = await client.post("/auth/candidate/initiate", json=payload)
        print("Status Code:", r.status_code)
        res = r.json()
        print("Response:", res)
        assert res["status"] == "eligible", "Test 5 failed"
        token = res["token"]

        print("\n=== TEST 6: Get position to register under ===")
        async with SessionLocal() as db:
            pos_res = await db.execute(select(Position).limit(1))
            position = pos_res.scalars().first()
            if not position:
                print("No positions found to run register test.")
                return
            pos_id = str(position.position_id)
            print("Target Position ID:", pos_id, "-", position.title)

        print("\n=== TEST 7: Register with weak password (should fail) ===")
        reg_payload = {
            "otp_session_token": token,
            "position_id": pos_id,
            "party_name": "Test Party",
            "mobile_number": "9900990099",
            "new_password": "weak",
            "full_name": "Test Student New",
            "department": "CSE",
            "student_id": "TESTUSN001"
        }
        r = await client.post("/candidates/register", json=reg_payload)
        print("Status Code:", r.status_code)
        print("Response:", r.json())
        assert r.status_code == 400, "Test 7 failed: Should reject weak password"

        print("\n=== TEST 8: Register with strong password (should succeed) ===")
        reg_payload["new_password"] = "StrongP@ss123"
        r = await client.post("/candidates/register", json=reg_payload)
        print("Status Code:", r.status_code)
        res = r.json()
        print("Response:", res)
        assert r.status_code == 201, "Test 8 failed: Registration should succeed"
        assert res["status"] == "PENDING", "Test 8 failed: Candidate status should be PENDING"

        print("\n=== TEST 9: Verify voter auto-creation & audit logging in Database ===")
        async with SessionLocal() as db:
            voter_res = await db.execute(select(Voter).where(Voter.college_email == "newstudent@college.edu.in"))
            new_voter = voter_res.scalar_one_or_none()
            assert new_voter is not None, "Test 9 failed: Voter not created"
            print("Auto-created Voter Full Name:", new_voter.full_name)
            print("Auto-created Voter Student ID:", new_voter.student_id)
            
            audit_res = await db.execute(select(AuditLog).where(AuditLog.actor_id == new_voter.voter_id))
            audit_entry = audit_res.scalar_one_or_none()
            assert audit_entry is not None, "Test 9 failed: Audit log not written"
            print("Audit Log Event Type:", audit_entry.event_type)
            print("Audit Log Description:", audit_entry.description)

            # Cleanup test data to allow script to run repeatedly
            cand_res = await db.execute(select(Candidate).where(Candidate.voter_id == new_voter.voter_id))
            cand = cand_res.scalar_one_or_none()
            if cand:
                await db.delete(cand)
            await db.delete(audit_entry)
            await db.delete(new_voter)
            await db.commit()
            print("Cleanup completed successfully.")

    print("\nALL TEST CASES PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())
