"""Fix the manifesto E2E test file with corrections."""
import pathlib

path = pathlib.Path("tests/backend/test_manifesto_e2e.py")
content = path.read_text(encoding="utf-8")

# Fix 1: Accept both 400 and 413 for oversized file (middleware may intercept)
old = (
    '        oversized = b"x" * (11 * 1024 * 1024)  # 11 MB\n'
    '        response = await client.post(\n'
    '            "/api/v1/candidates/me/manifesto/upload",\n'
    '            files={"file": ("huge.pdf", oversized, "application/pdf")},\n'
    '        )\n'
    '        assert response.status_code == 400\n'
    '        detail = response.json()["detail"].lower()\n'
    '        assert "10mb" in detail or "exceeds" in detail'
)

new = (
    '        oversized = b"x" * (11 * 1024 * 1024)  # 11 MB\n'
    '        response = await client.post(\n'
    '            "/api/v1/candidates/me/manifesto/upload",\n'
    '            files={"file": ("huge.pdf", oversized, "application/pdf")},\n'
    '        )\n'
    '        # Middleware may return 413 (payload too large) before route handler runs\n'
    '        assert response.status_code in (400, 413), f"Expected 400 or 413, got {response.status_code}: {response.text}"\n'
    '        if response.status_code == 400:\n'
    '            detail = response.json()["detail"].lower()\n'
    '            assert "10mb" in detail or "exceeds" in detail'
)

assert old in content, "Could not find oversized file test block"
content = content.replace(old, new, 1)

# Fix 2: Remove unnecessary _current_auth.update in test_06
old2 = (
    '        # List manifestos as admin (get_current_user has admin role from _current_auth)\n'
    '        # But list_manifestos_for_admin uses get_admin_user which has its own override\n'
    '        # so it won\'t be affected by _current_auth changes.\n'
    '        response = await client.get("/api/v1/candidates/admin/manifestos")'
)
new2 = (
    '        # list_manifestos_for_admin uses get_admin_user (separate override)\n'
    '        response = await client.get("/api/v1/candidates/admin/manifestos")'
)
assert old2 in content, "Could not find test_06 comment block"
content = content.replace(old2, new2, 1)

# Fix 3: Clarify the confusing comment in test_09
old3 = (
    '        # Switch to voter\n'
    '        _current_auth.update({\n'
    '            "user_id": CANDIDATE_VOTER_ID,\n'
    '            "email": "voter@test.edu",\n'
    '            "role": "voter",\n'
    '        })\n'
    '        response = await client.get("/api/v1/candidates/")\n'
    '        assert response.status_code == 200\n'
    '        items = response.json()\n'
    '        if items:\n'
    '            assert items[0]["manifesto_image_url"] is None\n'
    '            assert items[0]["manifesto"] == ""'
)
# The comment above the voter switch needs to be clearer
# Let me find the exact text
old3_comment = (
    '        # Switch to voter'
)
new3_comment = (
    '        # Switch to voter — candidate is Approved so they appear in list,\n'
    '        # but draft manifesto content + image_url should be hidden'
)
assert old3_comment in content, "Could not find test_09 voter comment"
content = content.replace(old3_comment, new3_comment, 1)

# Write back
path.write_text(content, encoding="utf-8")
print(f"Fixed {path} ({len(content)} bytes)")
