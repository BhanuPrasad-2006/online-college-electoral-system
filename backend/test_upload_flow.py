"""
End-to-end test: Voter uploads photo admin approval flow
"""
import requests
import sys
import json

BASE = "http://127.0.0.1:8002"

VOTER_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3Nzk4MzE3NTIsInR5cGUiOiJhY2Nlc3MiLCJzdWIiOiIyNTU5NGQ4NC0zMWM2LTQwYmQtODA3MS1jMzllYzg3MmY3MWYiLCJyb2xlIjoidm90ZXIiLCJlbWFpbCI6IjFkczI0Y3kwMTVAZHNjZS5lZHUuaW4iLCJjc3JmX3Rva2VuIjoiZDVlNzdkNWZlMDYyNDNlN2RkZTc0MDY5MmZlNDgyODQiLCJkZXZpY2VfZnAiOiJhZTZjMjAxNDM0N2YyMWI2NGZhY2RkYzY1NmMwYTJjMjBjY2QyNjU4MWI1ZDVlNWFkZDg4MzA1MjdiNmYyODk1In0.iAB0kmhTk2vcB10viCM8yEYA3Wdx_w7L0lg4XpiIOcw"

CSRF = "d5e77d5fe06243e7dde740692fe48284"
FP = "ae6c2014347f21b64facddc656c0a2c20ccd26581b5d5e5add8830527b6f2895"

def step(label):
    print("\n" + '='*60)
    print(f"  {label}")
    print('='*60)

def ok(msg):
    print(f"  [OK] {msg}")

def fail(msg, resp=None):
    print(f"  [FAIL] {msg}")
    if resp:
        print(f"     HTTP {resp.status_code}: {resp.text[:300]}")
    return False

# Step 1: Upload photo
step("Step 1: Voter uploads a photo for review")

with open("test_face_real.jpg", "rb") as f:
    files = {"file": ("face.jpg", f, "image/jpeg")}
    headers = {"Authorization": f"Bearer {VOTER_JWT}", "X-CSRF-Token": CSRF, "X-Device-Fingerprint": FP}
    resp = requests.post(f"{BASE}/api/v1/vote/upload-photo", files=files, headers=headers)

if resp.status_code == 200:
    data = resp.json()
    ok("Upload succeeded!")
    print(json.dumps(data, indent=2))
    pending_url = data.get("pending_image_url", "N/A")
elif resp.status_code == 400:
    fail("No face detected: " + resp.json().get("detail", ""), resp)
    sys.exit(1)
elif resp.status_code == 503:
    fail("Face recognition unavailable: " + resp.json().get("detail", ""), resp)
    sys.exit(1)
else:
    fail("Unexpected status", resp)
    sys.exit(1)

# Step 2: Get admin token
step("Step 2: Admin login")

admin_resp = requests.post(f"{BASE}/api/v1/auth/admin/login", json={})
if admin_resp.status_code == 200:
    ADMIN_JWT = admin_resp.json().get("access_token", "")
    ok(f"Admin logged in, token starts with: {ADMIN_JWT[:20]}...")
else:
    # Try common creds
    for creds in [("admin@dsce.edu.in", "admin123"), ("admin", "admin"), ("admin@admin.com", "admin")]:
        ar = requests.post(f"{BASE}/api/v1/auth/admin/login", json={"email": creds[0], "password": creds[1]})
        if ar.status_code == 200:
            ADMIN_JWT = ar.json().get("access_token", "")
            ok(f"Admin logged in with {creds[0]}")
            break
    else:
        fail("Could not login as admin")
        sys.exit(1)

# Step 3: List pending photos
step("Step 3: List pending photos")

resp3 = requests.get(f"{BASE}/api/v1/admin/pending-photos", headers={"Authorization": f"Bearer {ADMIN_JWT}"})
if resp3.status_code == 200:
    pending = resp3.json()
    if isinstance(pending, list):
        ok(f"Found {len(pending)} pending photo(s):")
        for p in pending:
            print(f"  - {p.get('full_name')} - pending: {p.get('pending_image_url', 'N/A')[:60]}...")
        
        # Find our voter
        voter_id = None
        for p in pending:
            if "1ds24cy015" in str(p.get("college_email", "")):
                voter_id = p["voter_id"]
                break
        
        if voter_id:
            # Step 4: Approve
            step("Step 4: Admin approves the pending photo")
            resp4 = requests.post(f"{BASE}/api/v1/admin/pending-photos/{voter_id}/approve", headers={"Authorization": f"Bearer {ADMIN_JWT}"})
            if resp4.status_code == 200:
                d4 = resp4.json()
                ok("Approval succeeded!")
                print(json.dumps(d4, indent=2))
            else:
                fail("Approval failed", resp4)
                sys.exit(1)
            
            # Step 5: Verify
            step("Step 5: Verify voter no longer in pending list")
            resp5 = requests.get(f"{BASE}/api/v1/admin/pending-photos", headers={"Authorization": f"Bearer {ADMIN_JWT}"})
            if resp5.status_code == 200:
                still_pending = [p for p in resp5.json() if "1ds24cy015" in str(p.get("college_email", ""))]
                if still_pending:
                    fail("Voter still appears in pending photos!")
                else:
                    ok("Voter no longer appears in pending photos - approval complete!")
        else:
            fail("Could not find test voter in pending photos")
    else:
        print(f"Response: {resp3.text[:200]}")
else:
    fail("Failed to list pending photos", resp3)

print("\n" + '='*60)
print("  TEST COMPLETE")
print('='*60)
