"""
Append 5 edge case test methods to TestManifestoUploadFlow in
tests/backend/test_manifesto_e2e.py.
"""

TEST_FILE = "tests/backend/test_manifesto_e2e.py"

with open(TEST_FILE, "r", encoding="utf-8") as f:
    content = f.read()

new_tests = '''
    # ═══════════════════════════════════════════════════════
    #   EDGE CASE TESTS
    # ═══════════════════════════════════════════════════════

    @pytest.mark.asyncio
    async def test_12_corrupt_image_upload_succeeds(
        self, client: AsyncClient, seeded_data: dict,
    ):
        """Upload garbage bytes with valid .png + image/png -> 200.
        The server does NOT validate image integrity (no PIL/pillow scan).
        """
        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "candidate@test.edu",
            "role": "candidate",
        })

        garbage = bytes([0x00, 0xFF, 0xAA, 0xBB] * 256)  # 1024 bytes of garbage

        fake_url = "https://supabase.test/storage/v1/object/public/campaign-media/manifestos/test/corrupt.png"

        with patch("app.routes.candidates.settings.SUPABASE_URL", "https://test.supabase.co"), \\
             patch("app.routes.candidates.settings.SUPABASE_SERVICE_ROLE_KEY", "test-key"), \\
             patch(
                 "app.routes.candidates.upload_manifesto_media",
                 new_callable=AsyncMock,
                 return_value=UploadedStorageObject(
                     path="manifestos/test/corrupt.png",
                     public_url=fake_url,
                 ),
             ):
            response = await client.post(
                "/api/v1/candidates/me/manifesto/upload",
                files={"file": ("manifesto.png", garbage, "image/png")},
            )

        assert response.status_code == 200, f"Corrupt image upload failed: {response.text}"
        data = response.json()
        assert data["url"] == fake_url
        assert "manifestos/test/" in data["path"]

    @pytest.mark.asyncio
    async def test_13_malicious_content_in_file_rejected(
        self, client: AsyncClient, seeded_data: dict,
    ):
        """File with <script tag in first 4096 bytes -> 400."""
        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "candidate@test.edu",
            "role": "candidate",
        })

        malicious = b"\\x89PNG\\r\\n\\x1a\\n" + b"<script>alert('xss')</script>" + b"\\x00" * 100

        response = await client.post(
            "/api/v1/candidates/me/manifesto/upload",
            files={"file": ("innocent.png", malicious, "image/png")},
        )

        assert response.status_code == 400
        detail = response.json()["detail"].lower()
        assert "security" in detail or "disallowed" in detail or "reject" in detail or "content" in detail

    @pytest.mark.asyncio
    async def test_14_concurrent_uploads(
        self, client: AsyncClient, seeded_data: dict,
    ):
        """5 simultaneous uploads should all succeed (no race conditions)."""
        import asyncio

        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "candidate@test.edu",
            "role": "candidate",
        })

        fake_base_url = "https://supabase.test/storage/v1/object/public/campaign-media/manifestos/concurrent"

        async def upload_one(index: int):
            fake_url = f"{fake_base_url}/img_{index}.png"
            with patch("app.routes.candidates.settings.SUPABASE_URL", "https://test.supabase.co"), \\
                 patch("app.routes.candidates.settings.SUPABASE_SERVICE_ROLE_KEY", "test-key"), \\
                 patch(
                     "app.routes.candidates.upload_manifesto_media",
                     new_callable=AsyncMock,
                     return_value=UploadedStorageObject(
                         path=f"manifestos/concurrent/img_{index}.png",
                         public_url=fake_url,
                     ),
                 ):
                resp = await client.post(
                    "/api/v1/candidates/me/manifesto/upload",
                    files={"file": (f"img_{index}.png", b"fake-image-data", "image/png")},
                )
                return index, resp.status_code, resp.json()

        tasks = [upload_one(i) for i in range(5)]
        results = await asyncio.gather(*tasks)

        for index, status_code, data in results:
            assert status_code == 200, f"Concurrent upload {index} failed with {status_code}"
            assert f"manifestos/concurrent/img_{index}.png" in data["path"]
            assert "storage/v1/object/public" in data["url"]

        urls = {data["url"] for _, _, data in results}
        assert len(urls) == 5, f"Expected 5 unique URLs, got {len(urls)}"

    @pytest.mark.asyncio
    async def test_15_expired_token_rejected(
        self, client: AsyncClient, seeded_data: dict,
    ):
        """When token is expired/invalid, upload returns 401."""
        from fastapi import HTTPException, status

        async def mock_expired_token():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
            )

        original_override = app.dependency_overrides.get(get_current_user)
        app.dependency_overrides[get_current_user] = mock_expired_token

        try:
            response = await client.post(
                "/api/v1/candidates/me/manifesto/upload",
                files={"file": ("test.png", b"data", "image/png")},
            )
        finally:
            if original_override is not None:
                app.dependency_overrides[get_current_user] = original_override
            else:
                del app.dependency_overrides[get_current_user]

        assert response.status_code == 401
        detail = response.json()["detail"].lower()
        assert any(w in detail for w in ["expired", "unauthorized", "invalid", "token"])

    @pytest.mark.asyncio
    async def test_16_extremely_long_manifesto_text(
        self, client: AsyncClient, seeded_data: dict,
    ):
        """Save and retrieve manifesto with ~100K characters."""
        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "candidate@test.edu",
            "role": "candidate",
        })

        long_paragraph = "This is a very long manifesto paragraph. " * 2000
        assert len(long_paragraph) > 90000, f"Long paragraph too short: {len(long_paragraph)}"

        save_resp = await client.put(
            "/api/v1/candidates/me/manifesto",
            json={
                "manifesto": long_paragraph,
                "submit": False,
            },
        )
        assert save_resp.status_code == 200, f"Save long manifesto failed: {save_resp.text}"

        profile_resp = await client.get("/api/v1/candidates/me")
        assert profile_resp.status_code == 200
        data = profile_resp.json()

        assert "manifesto" in data
        retrieved = data["manifesto"]
        assert len(retrieved) > 80000, f"Retrieved manifesto too short: {len(retrieved)}"
        assert "very long manifesto paragraph" in retrieved.lower()
        assert retrieved.count("very long manifesto paragraph") > 500

        _current_auth.update({
            "user_id": CANDIDATE_VOTER_ID,
            "email": "voter@test.edu",
            "role": "voter",
        })
        list_resp = await client.get("/api/v1/candidates/")
        assert list_resp.status_code == 200
        items = list_resp.json()
        if items:
            assert items[0]["manifesto"] == "", \
                f"Expected empty manifesto for voters, got {len(items[0]['manifesto'])} chars"
'''

# Find the anchor: the last "assert profile_resp.json()" line of test_11
anchor = '        assert profile_resp.json()["manifesto_image_url"] is None'
idx = content.rfind(anchor)
if idx == -1:
    print("ERROR: Could not find anchor point")
    exit(1)

# Find the end of that line
line_end = content.find("\n", idx)
new_content = content[:line_end] + new_tests + content[line_end:]

with open(TEST_FILE, "w", encoding="utf-8") as f:
    f.write(new_content)

count = new_tests.count("async def test_")
print(f"Added {count} edge case tests successfully")
total = new_content.count("async def test_")
print(f"Total tests in file: {total}")
