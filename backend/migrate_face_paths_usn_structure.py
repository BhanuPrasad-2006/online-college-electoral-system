"""
Migrate face images from legacy layouts to department/USN structure.

Legacy patterns:
  uploads/faces/student_{voter_uuid}.jpg
  uploads/faces/pending_voter_{voter_uuid}.jpg
  uploads/faces/{voter_uuid}/{random}.ext
  Supabase: faces/{voter_uuid}/{random}.ext (DB URL updated; re-upload optional)

New layout:
  uploads/faces/{DEPARTMENT}/{USN}_{voter_hash6}.jpg
  uploads/faces/{DEPARTMENT}/pending_{USN}_{voter_hash6}.jpg

Run from backend directory:
  python migrate_face_paths_usn_structure.py
  python migrate_face_paths_usn_structure.py --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import uuid

import httpx
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.voter import Voter
from app.services.face_storage import (
    build_local_filesystem_path,
    build_object_path,
    is_already_usn_layout,
    load_reference_image_bytes,
    reference_url_from_object_path,
    resolve_local_path,
    save_voter_face_image,
    FACES_ROOT,
)

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.I,
)


async def _load_bytes_from_any_url(url: str) -> bytes | None:
    if not url:
        return None
    data = await load_reference_image_bytes(url)
    if data:
        return data
    if url.startswith("http"):
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(url, timeout=30.0)
                if r.status_code == 200:
                    return r.content
        except Exception:
            pass
    return None


def _find_legacy_file_for_voter(voter_id: str) -> str | None:
    """Scan uploads/faces for legacy files tied to this voter."""
    vid = str(voter_id).lower()
    if not os.path.isdir(FACES_ROOT):
        return None

    candidates: list[str] = []

    for entry in os.listdir(FACES_ROOT):
        full = os.path.join(FACES_ROOT, entry)
        if os.path.isfile(full):
            name_lower = entry.lower()
            if f"student_{vid}" in name_lower or f"pending_voter_{vid}" in name_lower:
                candidates.append(full)
        elif os.path.isdir(full) and UUID_RE.match(entry):
            if entry.lower() == vid:
                for fname in os.listdir(full):
                    fpath = os.path.join(full, fname)
                    if os.path.isfile(fpath):
                        candidates.append(fpath)

    if not candidates:
        return None
    # Prefer non-pending for reference; caller decides field
    candidates.sort(key=lambda p: ("pending" in os.path.basename(p).lower(), p))
    return candidates[0]


async def migrate_voter_field(
    voter: Voter,
    field: str,
    *,
    dry_run: bool,
    pending: bool,
) -> bool:
    url = getattr(voter, field, None)
    if not url:
        return False
    if is_already_usn_layout(url):
        print(f"  SKIP {field}: already USN layout ({url[:80]}...)")
        return False

    if not voter.student_id:
        print(f"  SKIP {field}: voter {voter.college_email} has no student_id (USN)")
        return False

    image_bytes = await _load_bytes_from_any_url(url)
    if not image_bytes:
        legacy = _find_legacy_file_for_voter(str(voter.voter_id))
        if legacy:
            with open(legacy, "rb") as f:
                image_bytes = f.read()
            print(f"  Found legacy file on disk: {legacy}")

    if not image_bytes:
        print(f"  WARN {field}: could not load image for {voter.college_email}")
        return False

    ext = ".jpg"
    if "." in url.split("/")[-1]:
        ext = os.path.splitext(url.split("/")[-1])[1].lower() or ".jpg"
        if ext == ".jpeg":
            ext = ".jpg"

    object_path = build_object_path(
        voter.department,
        voter.student_id,
        voter.voter_id,
        ext,
        pending=pending,
    )
    target_local = build_local_filesystem_path(object_path)

    print(f"  MIGRATE {field}: -> {target_local}")

    if dry_run:
        return True

    if url.startswith("http"):
        try:
            saved = await save_voter_face_image(
                voter,
                image_bytes,
                os.path.basename(target_local),
                "image/jpeg",
                pending=pending,
            )
            setattr(voter, field, saved.reference_url)
            return True
        except Exception as e:
            print(f"  ERROR Supabase re-upload: {e}")
            return False

    os.makedirs(os.path.dirname(target_local), exist_ok=True)
    with open(target_local, "wb") as f:
        f.write(image_bytes)
    setattr(voter, field, reference_url_from_object_path(object_path))
    return True


async def run_migration(*, dry_run: bool) -> None:
    async with SessionLocal() as db:
        res = await db.execute(select(Voter))
        voters = res.scalars().all()
        print(f"Processing {len(voters)} voters...")

        migrated = 0
        for voter in voters:
            changed = False
            if voter.reference_image_url:
                if await migrate_voter_field(voter, "reference_image_url", dry_run=dry_run, pending=False):
                    changed = True
            if voter.pending_image_url:
                if await migrate_voter_field(voter, "pending_image_url", dry_run=dry_run, pending=True):
                    changed = True
            if changed:
                migrated += 1
                print(f"OK {voter.student_id} ({voter.department}) — {voter.full_name}")

        if dry_run:
            print(f"\nDry run complete. Would migrate {migrated} voter(s).")
            await db.rollback()
        else:
            await db.commit()
            print(f"\nCommitted. Migrated {migrated} voter(s).")


def main():
    parser = argparse.ArgumentParser(description="Migrate face images to department/USN paths")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()
    asyncio.run(run_migration(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
