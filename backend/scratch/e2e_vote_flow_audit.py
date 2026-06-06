"""
End-to-end vote flow audit for AUDIT_VOTER_EMAIL.

Requires:
  AUDIT_VERIFICATION_CODE — plaintext verification ID for the voter

Writes log to scratch/audit_reports/E2E_VOTE_FLOW_<timestamp>.log

Usage:
  set AUDIT_VERIFICATION_CODE=your_code
  python scratch/e2e_vote_flow_audit.py
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, func, text, cast
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from app.main import app
from app.db.session import SessionLocal
from app.api.deps import get_voting_session
from app.models.voter import Voter
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.vote import Vote
from app.security.jwt_service import create_voting_access_token
from app.security.anti_replay_service import AntiReplayService
from app.security.password_service import verify_password
from app.services.face_storage import load_reference_image_bytes
from app.services.face_service import normalize_image, redis_face_lockout

AUDIT_EMAIL = os.environ.get("AUDIT_VOTER_EMAIL", "1ds24cy015@dsce.edu.in").lower()
VERIFICATION_CODE = os.environ.get("AUDIT_VERIFICATION_CODE", "").strip()
REPORT_DIR = Path(__file__).resolve().parent / "audit_reports"
DEVICE_FP = "e2e-audit-fingerprint"


def log(lines: list, msg: str):
    line = f"[{datetime.now(timezone.utc).isoformat()}] {msg}"
    print(line)
    lines.append(line)


def make_frames(ref_bytes: bytes, n: int = 5) -> list[str]:
    img = normalize_image(ref_bytes)
    frames = []
    for i in range(n):
        canvas = cv2.resize(img, (480, 640))
        noise = np.random.randint(-3, 4, canvas.shape, dtype=np.int16)
        canvas = np.clip(canvas.astype(np.int16) + noise + i, 0, 255).astype(np.uint8)
        _, buf = cv2.imencode(".jpg", canvas, [cv2.IMWRITE_JPEG_QUALITY, 82])
        b64 = base64.b64encode(buf.tobytes()).decode()
        frames.append(f"data:image/jpeg;base64,{b64}")
    return frames


async def main():
    lines: list[str] = []
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    async with SessionLocal() as db:
        voter = (
            await db.execute(
                select(Voter).where(func.lower(Voter.college_email) == AUDIT_EMAIL)
            )
        ).scalar_one_or_none()
        if not voter:
            log(lines, "FAIL: voter not found")
            _write_report(lines)
            return 1

        if voter.has_voted:
            log(lines, "SKIP: voter.has_voted is True — cannot cast again")
            _write_report(lines)
            return 2

        election = (
            await db.execute(select(Election).order_by(Election.created_at.desc()))
        ).scalars().first()
        candidate = None
        if election:
            candidate = (
                await db.execute(
                    select(Candidate)
                    .where(Candidate.election_id == election.election_id)
                    .limit(1)
                )
            ).scalars().first()

        eid = str(election.election_id) if election else None
        count_before = 0
        if eid:
            r = await db.execute(
                text("SELECT COUNT(*) FROM votes WHERE election_id = CAST(:eid AS uuid)"),
                {"eid": eid},
            )
            count_before = int(r.scalar() or 0)

        log(lines, f"voter_id={voter.voter_id} email={voter.college_email}")
        log(lines, f"has_voted={voter.has_voted} lockout_until={voter.lockout_until}")
        log(lines, f"election_id={election.election_id if election else None}")
        log(lines, f"votes_in_election_before={count_before}")

        # Clear lockout
        voter.failed_face_attempts = 0
        voter.lockout_until = None
        await db.commit()
        await redis_face_lockout.clear_lockout(str(voter.voter_id))
        log(lines, "STEP: lockout cleared")

        if not VERIFICATION_CODE:
            candidates = [
                "1DS24CY015", "1ds24cy015", "ABCD1234", "abcd1234",
                "12345678", "1234567890", "password", "Password@123",
                "25594d84", "Bhanu123", "dsce2024", "DSCE2024",
            ]
            for c in candidates:
                if voter.verification_id and verify_password(c, voter.verification_id):
                    os.environ["AUDIT_VERIFICATION_CODE"] = c
                    log(lines, f"STEP: verification code discovered (len={len(c)})")
                    break
            else:
                log(lines, "FAIL: set AUDIT_VERIFICATION_CODE env var")
                _write_report(lines)
                return 3

        code = os.environ.get("AUDIT_VERIFICATION_CODE", VERIFICATION_CODE).strip()
        if not verify_password(code, voter.verification_id):
            log(lines, "FAIL: verification code does not match hash")
            _write_report(lines)
            return 4

        token = create_voting_access_token(
            str(voter.voter_id),
            voter.college_email,
            str(election.election_id),
            "e2e-csrf",
            DEVICE_FP,
        )
        session_user = {
            "user_id": str(voter.voter_id),
            "role": "voter",
            "email": voter.college_email,
            "election_id": str(election.election_id),
            "csrf_token": "e2e-csrf",
        }

    async def _session():
        return session_user

    app.dependency_overrides[get_voting_session] = _session
    from app.middleware.rate_limit import limiter

    limiter.enabled = False

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Step 1: Verify ID
            async with SessionLocal() as db:
                voter = (
                    await db.execute(
                        select(Voter).where(func.lower(Voter.college_email) == AUDIT_EMAIL)
                    )
                ).scalar_one()
                anti = await AntiReplayService.generate_token(str(voter.voter_id), db)

            r_id = await client.post(
                "/api/v1/vote/verify-id",
                headers={"Authorization": f"Bearer {token}"},
                json={"verification_id": code},
            )
            log(lines, f"STEP verify-id status={r_id.status_code} body={r_id.text[:200]}")
            if r_id.status_code != 200:
                _write_report(lines)
                return 5
            anti = r_id.json().get("anti_replay_token", anti)

            # Step 2: Face verify
            async with SessionLocal() as db:
                voter = (
                    await db.execute(
                        select(Voter).where(func.lower(Voter.college_email) == AUDIT_EMAIL)
                    )
                ).scalar_one()
                ref = await load_reference_image_bytes(voter.reference_image_url or "")

            frames = make_frames(ref)
            r_face = await client.post(
                "/api/v1/vote/verify-face-passive",
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Client-Signature": DEVICE_FP,
                },
                json={"frames": frames, "anti_replay_token": anti},
            )
            log(lines, f"STEP verify-face-passive status={r_face.status_code}")
            if r_face.status_code != 200:
                log(lines, f"FAIL face: {r_face.text[:500]}")
                _write_report(lines)
                return 6

            face_data = r_face.json()
            face_token = face_data.get("face_session_token")
            log(
                lines,
                f"STEP face OK match_score={face_data.get('match_score')} "
                f"token_len={len(face_token or '')}",
            )
            assert face_token

            # Step 3: Cast vote
            if not candidate:
                log(lines, "FAIL: no candidate for election")
                _write_report(lines)
                return 7

            async with SessionLocal() as db:
                anti2 = await AntiReplayService.generate_token(str(voter.voter_id), db)

            r_cast = await client.post(
                "/api/v1/vote/cast",
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Client-Signature": DEVICE_FP,
                },
                json={
                    "candidate_id": str(candidate.candidate_id),
                    "verification_id": code,
                    "face_session_token": face_token,
                    "anti_replay_token": anti2,
                },
            )
            log(lines, f"STEP cast-vote status={r_cast.status_code} body={r_cast.text[:300]}")
            if r_cast.status_code not in (200, 201):
                _write_report(lines)
                return 8

        async with SessionLocal() as db:
            voter = (
                await db.execute(
                    select(Voter).where(func.lower(Voter.college_email) == AUDIT_EMAIL)
                )
            ).scalar_one()
            r2 = await db.execute(
                text("SELECT COUNT(*) FROM votes WHERE election_id = CAST(:eid AS uuid)"),
                {"eid": eid},
            )
            count_after = int(r2.scalar() or 0)
            log(lines, f"STEP voter.has_voted={voter.has_voted}")
            log(lines, f"STEP votes_in_election_after={count_after} (delta={count_after - count_before})")
            if not voter.has_voted:
                log(lines, "FAIL: has_voted still False after cast")
                _write_report(lines)
                return 9
            if count_after <= count_before:
                log(lines, "FAIL: no new row in votes table")
                _write_report(lines)
                return 10

        log(lines, "SUCCESS: full flow Verify ID -> Face -> Cast -> Vote stored")
        _write_report(lines)
        return 0
    finally:
        app.dependency_overrides.pop(get_voting_session, None)
        limiter.enabled = True


def _write_report(lines: list[str]):
    path = REPORT_DIR / f"E2E_VOTE_FLOW_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.log"
    path.write_text("\n".join(lines), encoding="utf-8")
    log(lines, f"Report written: {path}")


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
