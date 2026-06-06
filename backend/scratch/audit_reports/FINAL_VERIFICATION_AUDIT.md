# Final Face Verification Audit Report

**Date:** 2026-06-04 (UTC)  
**Voter:** `1ds24cy015@dsce.edu.in`  
**Automated suite:** `tests/backend/test_face_final_audit.py` — **13/13 PASSED**

---

## Checklist

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | `waitForNewVideoFrame()` before every captured frame | **PASS** | Inside `for (let i = 0; i < TOTAL_FRAMES; i++)` loop in `vote.tsx`; uses `requestVideoFrameCallback` when available (Chrome/Edge/Brave) |
| 2 | Frame timestamps differ across 5 frames | **PASS (simulated)** | `test_simulated_frames_have_distinct_hashes` — 5 unique JPEG SHA-256 hashes; live capture uses `video.currentTime` advance |
| 3 | Passive liveness on Chrome / Edge / Brave | **PASS (architecture)** | Liveness is **server-side**; browsers share identical canvas pipeline; `requestVideoFrameCallback` path added for Chromium |
| 4 | Laptop webcams 480p / 720p / 1080p | **PASS** | `test_passive_liveness_at_multiple_resolutions` — source 640×480, 1280×720, 1920×1080 → canvas 480×640 → liveness PASS |
| 5 | Backend distinct error messages | **PASS** | See table below |
| 6 | Frontend shows backend messages (not generic) | **PASS** | `api.ts` maps `detail.message`; `vote.tsx` sets `passiveError(msg)` except empty/fallback |
| 7 | Lockout clears after timeout | **PASS** | Redis TTL expiry tested; DB `lockout_until` in past allows retry |
| 8 | Success creates biometric token | **PASS** | `test_success_issues_face_session_token` — JWT `face_session_token`, audit `BIOMETRIC_TOKEN_ISSUED` |
| 9 | Full vote stored in DB | **BLOCKED** | Verification ID unknown — set `AUDIT_VERIFICATION_CODE` and re-run E2E |

---

## Backend error messages (verified)

| Scenario | HTTP | Message (excerpt) |
|----------|------|-------------------|
| Lockout | 403 | `Face verification is locked. Try again in …` |
| Insufficient frames | 400 | `Expected 3–8 frames, got …` |
| No face (quality) | — | `No face detected or face is too far/tiny…` (in `face_service.py`) |
| Multiple faces | — | `Multiple faces detected. Ensure only one person…` |
| Low quality batch | 400 | `Could not capture enough valid face images…` |
| Liveness failed | 400 | `Unable to verify live face. Your face was not detected as a live person…` |
| Face mismatch | 400 | `Face match below threshold (X%). Captured face does not match…` |
| Replay | 400 | `Replay attack detected. Please try again.` |

---

## Automated test log (excerpt)

```
13 passed in 84.00s

test_wait_for_new_video_frame_before_every_capture PASSED
test_frame_canvas_output_dimensions_fixed_480x640 PASSED
test_simulated_frames_have_distinct_hashes PASSED
test_backend_message_lockout PASSED
test_backend_message_insufficient_frames PASSED
test_backend_message_liveness_failed PASSED
test_backend_message_face_mismatch PASSED
test_backend_quality_messages_no_face_and_multiple_faces PASSED
test_frontend_api_maps_detail_message_to_error PASSED
test_lockout_expires_automatically PASSED
test_success_issues_face_session_token PASSED
test_passive_liveness_at_multiple_resolutions PASSED
test_write_audit_report_json PASSED
```

Face verify API success log (from `test_success_issues_face_session_token`):

```
PASSIVE_BIOMETRIC_SUCCESS voter=1ds24cy015@dsce.edu.in matched=5/5 avg_score=94.1%
face_session_token issued (JWT length > 20)
```

---

## E2E vote flow

**Script:** `backend/scratch/e2e_vote_flow_audit.py`  
**Log:** `backend/scratch/audit_reports/E2E_VOTE_FLOW_20260604_203412.log`

```
has_voted=False, voting_allowed=True, votes_before=0
lockout cleared
FAIL: set AUDIT_VERIFICATION_CODE env var
```

To complete item 9 (real vote in DB):

```powershell
cd backend
$env:AUDIT_VERIFICATION_CODE = "<your verification ID>"
python scratch/e2e_vote_flow_audit.py
```

Expected success log lines:

```
STEP verify-id status=200
STEP verify-face-passive status=200
STEP cast-vote status=200
STEP voter.has_voted=True
STEP votes_in_election_after=N (delta=1)
SUCCESS: full flow Verify ID -> Face -> Cast -> Vote stored
```

---

## Manual browser verification (screenshots)

Cannot be captured from this environment. Recommended steps:

1. Restart frontend (`npm run dev`) and backend.
2. Log in as `1ds24cy015@dsce.edu.in`.
3. Open DevTools → Console; during face capture confirm 5 distinct `video.currentTime` values (optional: add temporary `console.log` in capture loop).
4. Repeat on Chrome, Edge, Brave.
5. Test at 480p / 720p / 1080p camera settings (OS settings); UI always submits 480×640 JPEG frames.
6. Screenshot: face success → ballot → cast → success screen.
7. Confirm DB: `voters.has_voted = true` and new row in `votes`.

---

## Production readiness

| Gate | Status |
|------|--------|
| Root cause fixed (duplicate frames + lockout + UI messages) | Yes |
| Automated regression suite | Yes (13 tests) |
| Real vote persisted for audit voter | **No — pending verification code** |

**Do not mark production-ready** until E2E script exits 0 and `has_voted=True` with `votes` delta + 1.
