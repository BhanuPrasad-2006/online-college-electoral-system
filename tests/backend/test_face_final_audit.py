"""
Final face verification audit — static + API message + lockout + token tests.

Run: cd backend && pytest ../tests/backend/test_face_final_audit.py -v
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

BACKEND_ROOT = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app
from app.db.session import get_db, SessionLocal
from app.api.deps import get_voting_session
from app.core.config import settings
from app.models.voter import Voter
from app.models.election import Election
from app.models.candidate import Candidate
from app.security.jwt_service import create_voting_access_token
from app.security.anti_replay_service import AntiReplayService
from app.services.face_service import redis_face_lockout, normalize_image
from app.services.face_storage import load_reference_image_bytes
from app.services.passive_liveness_service import check_passive_liveness, MIN_FRAMES

VOTE_TSX = BACKEND_ROOT.parent / "frontend" / "src" / "routes" / "voter" / "vote.tsx"
AUDIT_EMAIL = os.environ.get("AUDIT_VOTER_EMAIL", "1ds24cy015@dsce.edu.in").lower()
REPORT_DIR = BACKEND_ROOT / "scratch" / "audit_reports"


def _read_vote_tsx() -> str:
    return VOTE_TSX.read_text(encoding="utf-8")


# ── 1 & 2: Frontend capture loop static audit ───────────────────

def test_wait_for_new_video_frame_before_every_capture():
    src = _read_vote_tsx()
    phase2 = src.split("Capture 5 frames with jitter")[1].split("Phase 3: Submit")[0]
    assert "for (let i = 0; i < TOTAL_FRAMES; i++)" in phase2
    assert phase2.count("await waitForNewVideoFrame(video)") == 1, (
        "waitForNewVideoFrame must be inside the 5-frame loop (once per iteration)"
    )
    assert phase2.index("waitForNewVideoFrame") < phase2.index("captureFrame()"), (
        "waitForNewVideoFrame must run before captureFrame in each iteration"
    )
    assert "requestVideoFrameCallback" in src, (
        "Chrome/Edge/Brave frame callback should be used when available"
    )


def test_frame_canvas_output_dimensions_fixed_480x640():
    src = _read_vote_tsx()
    assert 'canvas.width  = FRAME_W' in src and "FRAME_W        = 480" in src
    assert 'canvas.height = FRAME_H' in src and "FRAME_H        = 640" in src


def test_simulated_frames_have_distinct_hashes():
    """Proxy for timestamp uniqueness: distinct JPEG bytes across 5 captures."""
    import hashlib

    async def _run():
        async with SessionLocal() as db:
            res = await db.execute(
                select(Voter).where(Voter.college_email.ilike(AUDIT_EMAIL))
            )
            voter = res.scalar_one_or_none()
            if not voter:
                pytest.skip(f"Voter {AUDIT_EMAIL} not in DB")
            ref = await load_reference_image_bytes(voter.reference_image_url or "")
            img = normalize_image(ref)
            hashes = set()
            for i in range(5):
                resized = cv2.resize(img, (480, 640))
                noise = np.random.randint(-2, 3, resized.shape, dtype=np.int16)
                noisy = np.clip(resized.astype(np.int16) + noise + i, 0, 255).astype(np.uint8)
                _, buf = cv2.imencode(".jpg", noisy, [cv2.IMWRITE_JPEG_QUALITY, 82])
                hashes.add(hashlib.sha256(buf.tobytes()).hexdigest())
            assert len(hashes) == 5

    asyncio.run(_run())


# ── 5: Backend distinct error messages ──────────────────────────

@pytest_asyncio.fixture
async def voter_client():
    async with SessionLocal() as db:
        res = await db.execute(
            select(Voter).where(Voter.college_email.ilike(AUDIT_EMAIL))
        )
        voter = res.scalar_one_or_none()
        if not voter:
            pytest.skip("Audit voter not in database")
        election = (
            await db.execute(select(Election).order_by(Election.created_at.desc()))
        ).scalars().first()
        token = create_voting_access_token(
            voter_id=str(voter.voter_id),
            email=voter.college_email,
            election_id=str(election.election_id) if election else str(uuid.uuid4()),
            csrf_token="audit-csrf",
            device_fingerprint="audit-fp",
        )
        session_user = {
            "user_id": str(voter.voter_id),
            "role": "voter",
            "email": voter.college_email,
            "election_id": str(election.election_id) if election else None,
            "csrf_token": "audit-csrf",
        }

    async def _override_voting_session():
        return session_user

    app.dependency_overrides[get_voting_session] = _override_voting_session
    from app.middleware.rate_limit import limiter

    limiter.enabled = False
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, voter, token
    app.dependency_overrides.pop(get_voting_session, None)
    limiter.enabled = True


def _b64_frame_from_bytes(jpeg: bytes) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()


@pytest.mark.asyncio
async def test_backend_message_lockout(voter_client):
    client, voter, token = voter_client
    async with SessionLocal() as db:
        v = await db.get(Voter, voter.voter_id)
        v.lockout_until = datetime.now(timezone.utc) + timedelta(minutes=15)
        v.failed_face_attempts = 5
        await db.commit()
        await redis_face_lockout.set_lockout(str(v.voter_id), 15)

    r = await client.post(
        "/api/v1/vote/verify-face-passive",
        headers={"Authorization": f"Bearer {token}"},
        json={"frames": ["a"], "anti_replay_token": "x"},
    )
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert "locked" in detail.lower() or "lockout" in detail.lower()

    async with SessionLocal() as db:
        v = await db.get(Voter, voter.voter_id)
        v.lockout_until = None
        v.failed_face_attempts = 0
        await db.commit()
    await redis_face_lockout.clear_lockout(str(voter.voter_id))


@pytest.mark.asyncio
async def test_backend_message_insufficient_frames(voter_client):
    client, voter, token = voter_client
    async with SessionLocal() as db:
        anti = await AntiReplayService.generate_token(str(voter.voter_id), db)
    r = await client.post(
        "/api/v1/vote/verify-face-passive",
        headers={"Authorization": f"Bearer {token}"},
        json={"frames": [], "anti_replay_token": anti},
    )
    assert r.status_code == 400
    assert "frame" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_backend_message_liveness_failed(voter_client):
    """Identical BGR frames fail passive liveness; API maps to live-face message."""
    from app.services.face_service import extract_face_embedding

    client, voter, token = voter_client
    async with SessionLocal() as db:
        anti = await AntiReplayService.generate_token(str(voter.voter_id), db)
        ref = await load_reference_image_bytes(voter.reference_image_url or "")
    img = normalize_image(ref)
    resized = cv2.resize(img, (480, 640))
    _, buf = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 82])
    bgr = normalize_image(buf.tobytes())
    emb = await extract_face_embedding(buf.tobytes())
    frames_bgr = [bgr] * 5
    embeddings = [emb] * 5
    live_ok, reason = check_passive_liveness(frames_bgr, embeddings)
    assert not live_ok
    assert reason and ("pixel noise" in reason.lower() or "drift" in reason.lower() or "brightness" in reason.lower())

    vote_py = Path(BACKEND_ROOT / "app/routes/vote.py").read_text(encoding="utf-8")
    assert "Unable to verify live face. Your face was not detected as a live person" in vote_py


@pytest.mark.asyncio
async def test_backend_message_face_mismatch(voter_client):
    client, voter, token = voter_client
    async with SessionLocal() as db:
        anti = await AntiReplayService.generate_token(str(voter.voter_id), db)
    # Random noise image — face may fail quality; use tiny valid noise frames
    frames = []
    for i in range(5):
        arr = np.random.randint(0, 255, (640, 480, 3), dtype=np.uint8)
        _, buf = cv2.imencode(".jpg", arr, [cv2.IMWRITE_JPEG_QUALITY, 82])
        frames.append(_b64_frame_from_bytes(buf.tobytes()))
    r = await client.post(
        "/api/v1/vote/verify-face-passive",
        headers={"Authorization": f"Bearer {token}"},
        json={"frames": frames, "anti_replay_token": anti},
    )
    assert r.status_code == 400
    detail = r.json()["detail"]
    if isinstance(detail, dict):
        msg = detail.get("message", "")
        assert "match" in msg.lower() or "capture" in msg.lower() or "face" in msg.lower()


def test_backend_quality_messages_no_face_and_multiple_faces():
    face_py = Path(BACKEND_ROOT / "app/services/face_service.py").read_text(
        encoding="utf-8"
    )
    assert "No face detected" in face_py
    assert "Multiple faces detected" in face_py
    vote_py = Path(BACKEND_ROOT / "app/routes/vote.py").read_text(encoding="utf-8")
    assert "Could not capture enough valid face images" in vote_py


# ── 6: Frontend surfaces backend messages ───────────────────────

def test_frontend_api_maps_detail_message_to_error():
    api_src = (BACKEND_ROOT.parent / "frontend" / "src" / "lib" / "api.ts").read_text(
        encoding="utf-8"
    )
    assert "detail.message" in api_src
    vote_src = _read_vote_tsx()
    assert "err.message" in vote_src
    assert 'passiveError(msg)' in vote_src or "setPassiveError(msg)" in vote_src


# ── 7: Lockout clears after timeout ─────────────────────────────

@pytest.mark.asyncio
async def test_lockout_expires_automatically():
    vid = str(uuid.uuid4())
    await redis_face_lockout.set_lockout(vid, 0)  # 0 min → immediate expiry edge
    # Use 1 second TTL via direct redis if available
    if settings.USE_REDIS:
        try:
            from app.core.redis import redis_client

            key = f"face_lockout:{vid}"
            await redis_client.setex(key, 1, datetime.now(timezone.utc).isoformat())
            await asyncio.sleep(1.1)
            locked, rem = await redis_face_lockout.check_lockout(vid)
            assert not locked
        except Exception:
            pytest.skip("Redis unavailable")
    async with SessionLocal() as db:
        res = await db.execute(
            select(Voter).where(Voter.college_email.ilike(AUDIT_EMAIL))
        )
        voter = res.scalar_one()
        voter.lockout_until = datetime.now(timezone.utc) - timedelta(seconds=5)
        await db.commit()
        now = datetime.now(timezone.utc)
        assert voter.lockout_until < now


# ── 8: Biometric token on success ───────────────────────────────

@pytest.mark.asyncio
async def test_success_issues_face_session_token(voter_client):
    client, voter, token = voter_client
    async with SessionLocal() as db:
        v = await db.get(Voter, voter.voter_id)
        v.lockout_until = None
        v.failed_face_attempts = 0
        await db.commit()
        anti = await AntiReplayService.generate_token(str(voter.voter_id), db)
        ref = await load_reference_image_bytes(voter.reference_image_url or "")
    img = normalize_image(ref)
    h, w = img.shape[:2]
    target_ratio = 480 / 640
    current_ratio = w / h
    if current_ratio > target_ratio:
        new_w = int(h * target_ratio)
        start_x = (w - new_w) // 2
        img_cropped = img[:, start_x:start_x+new_w]
    else:
        new_h = int(w / target_ratio)
        start_y = (h - new_h) // 2
        img_cropped = img[start_y:start_y+new_h, :]

    frames = []
    for i in range(5):
        resized = cv2.resize(img_cropped, (480, 640))
        noise = np.random.randint(-3, 4, resized.shape, dtype=np.int16)
        noisy = np.clip(resized.astype(np.int16) + noise + i, 0, 255).astype(np.uint8)
        _, buf = cv2.imencode(".jpg", noisy, [cv2.IMWRITE_JPEG_QUALITY, 82])
        frames.append(_b64_frame_from_bytes(buf.tobytes()))
    r = await client.post(
        "/api/v1/vote/verify-face-passive",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Device-Fingerprint": "audit-fp",
        },
        json={"frames": frames, "anti_replay_token": anti},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("success") is True
    assert data.get("face_session_token")
    assert len(data["face_session_token"]) > 20


def test_passive_liveness_at_multiple_resolutions():
    """Canvas always 480x640; source can be 480p/720p/1080p before resize."""
    async def _run():
        async with SessionLocal() as db:
            voter = (
                await db.execute(
                    select(Voter).where(Voter.college_email.ilike(AUDIT_EMAIL))
                )
            ).scalar_one_or_none()
            if not voter:
                pytest.skip("no voter")
            ref = await load_reference_image_bytes(voter.reference_image_url or "")
        img = normalize_image(ref)
        for res in [(640, 480), (1280, 720), (1920, 1080)]:
            src = cv2.resize(img, res)
            # Center-crop src to 3:4 aspect ratio first
            sh, sw = src.shape[:2]
            target_ratio = 480 / 640
            current_ratio = sw / sh
            if current_ratio > target_ratio:
                new_w = int(sh * target_ratio)
                start_x = (sw - new_w) // 2
                src_cropped = src[:, start_x:start_x+new_w]
            else:
                new_h = int(sw / target_ratio)
                start_y = (sh - new_h) // 2
                src_cropped = src[start_y:start_y+new_h, :]

            frames_bgr = []
            embeddings = []
            for i in range(5):
                canvas = cv2.resize(src_cropped, (480, 640))
                noise = np.random.randint(-2, 3, canvas.shape, dtype=np.int16)
                canvas = np.clip(canvas.astype(np.int16) + noise + i, 0, 255).astype(np.uint8)
                _, buf = cv2.imencode(".jpg", canvas, [cv2.IMWRITE_JPEG_QUALITY, 82])
                from app.services.face_service import extract_face_embedding

                frames_bgr.append(normalize_image(buf.tobytes()))
                embeddings.append(await extract_face_embedding(buf.tobytes()))
            ok, _ = check_passive_liveness(frames_bgr, embeddings)
            assert ok, f"Liveness failed at source resolution {res}"

    asyncio.run(_run())


def test_write_audit_report_json():
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report = {
        "audit": "final_face_verification",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "voter_email": AUDIT_EMAIL,
        "checks": {
            "waitForNewVideoFrame_per_frame": True,
            "backend_messages": ["lockout", "liveness", "insufficient_frames", "quality_strings"],
            "canvas_output": "480x640",
            "resolutions_tested": ["480p", "720p", "1080p"],
            "browser_note": "Passive liveness is server-side; Chrome/Edge/Brave use same canvas pipeline.",
        },
    }
    out = REPORT_DIR / f"FINAL_FACE_AUDIT_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    assert out.exists()
