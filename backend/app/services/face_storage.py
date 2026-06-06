"""
Face reference image storage — department/USN layout with voter_id hash suffix.

Layout (local and Supabase object path):
  faces/{DEPARTMENT}/{USN}_{voter_hash6}.jpg
  faces/{DEPARTMENT}/pending_{USN}_{voter_hash6}.jpg  (voter re-upload, awaiting approval)

Authentication uses voter_id + face_encoding in DB, not filename.
"""

from __future__ import annotations

import hashlib
import os
import re
import uuid
from dataclasses import dataclass
from typing import Optional

import httpx

from app.core.config import settings
from app.models.voter import Voter
from app.services.supabase_storage import (
    SupabaseStorageError,
    UploadedStorageObject,
    _do_upload,
)
from app.utils.logger import logger

FACES_ROOT = "uploads/faces"
ALLOWED_FACE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
DEFAULT_EXTENSION = ".jpg"
MAX_USN_LEN = 40
MAX_DEPT_LEN = 32


class FaceStorageError(ValueError):
    pass


@dataclass
class FaceSaveResult:
    reference_url: str
    relative_path: str
    object_path: str


def _extension_from_filename(filename: str) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext in ALLOWED_FACE_EXTENSIONS:
        return ".jpg" if ext == ".jpeg" else ext
    return DEFAULT_EXTENSION


def sanitize_department(department: Optional[str]) -> str:
    if not department or not str(department).strip():
        return "UNKNOWN"
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "", str(department).strip().upper())
    return (cleaned[:MAX_DEPT_LEN] or "UNKNOWN")


def sanitize_usn(student_id: Optional[str]) -> str:
    if not student_id or not str(student_id).strip():
        raise FaceStorageError(
            "Voter USN (student_id) is required before uploading a face photo. "
            "Set the student's USN in their profile first."
        )
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "", str(student_id).strip().upper())
    if not cleaned:
        raise FaceStorageError("Invalid USN after sanitization.")
    return cleaned[:MAX_USN_LEN]


def voter_storage_hash(voter_id) -> str:
    """Short stable suffix from voter UUID (not used for auth)."""
    raw = str(voter_id).replace("-", "")
    try:
        uid = uuid.UUID(str(voter_id))
        return uid.hex[:6]
    except ValueError:
        return hashlib.sha256(raw.encode()).hexdigest()[:6]


def build_face_basename(
    student_id: str,
    voter_id,
    *,
    pending: bool = False,
) -> str:
    usn = sanitize_usn(student_id)
    vhash = voter_storage_hash(voter_id)
    prefix = "pending_" if pending else ""
    return f"{prefix}{usn}_{vhash}"


def build_object_path(
    department: str,
    student_id: str,
    voter_id,
    extension: str,
    *,
    pending: bool = False,
) -> str:
    dept = sanitize_department(department)
    ext = extension if extension in ALLOWED_FACE_EXTENSIONS else DEFAULT_EXTENSION
    if ext == ".jpeg":
        ext = ".jpg"
    basename = build_face_basename(student_id, voter_id, pending=pending)
    return f"faces/{dept}/{basename}{ext}"


def build_local_filesystem_path(object_path: str) -> str:
    """Map storage object path to on-disk path under uploads/."""
    normalized = object_path.replace("\\", "/").lstrip("/")
    if ".." in normalized.split("/"):
        raise FaceStorageError("Invalid storage path.")
    if normalized.startswith("uploads/"):
        return normalized
    return os.path.join("uploads", normalized)


def reference_url_from_object_path(object_path: str) -> str:
    local = build_local_filesystem_path(object_path)
    return f"/{local.replace(os.sep, '/')}"


def resolve_local_path(reference_url: str) -> Optional[str]:
    """
    Resolve reference_image_url to a readable local file path.
    Supports new layout, legacy flat student_{uuid}.*, and legacy UUID subfolders.
    """
    if not reference_url:
        return None

    url = reference_url.strip()

    if url.startswith("/uploads/"):
        path = url.lstrip("/")
        if os.path.isfile(path):
            return path
        # Legacy: URL might point to moved file — try basename under faces/**
        basename = os.path.basename(path)
        for root, _dirs, files in os.walk(FACES_ROOT):
            if basename in files:
                return os.path.join(root, basename)

    if url.startswith("uploads/"):
        if os.path.isfile(url):
            return url

    return None


async def load_reference_image_bytes(reference_url: str) -> Optional[bytes]:
    """Load face image bytes from local path or remote URL (Supabase/public)."""
    if not reference_url:
        return None

    local = resolve_local_path(reference_url)
    if local:
        try:
            with open(local, "rb") as f:
                return f.read()
        except OSError as e:
            logger.error(f"Failed to read face image {local}: {e}")
            return None

    if reference_url.startswith("http://") or reference_url.startswith("https://"):
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(reference_url, timeout=20.0)
                if resp.status_code == 200:
                    return resp.content
                logger.error(f"Face image download failed HTTP {resp.status_code}: {reference_url}")
        except Exception as e:
            logger.error(f"Face image download error: {e}")
    return None


def _validate_voter_for_face_upload(voter: Voter) -> tuple[str, str]:
    department = voter.department
    student_id = voter.student_id
    if not student_id:
        raise FaceStorageError(
            f"Voter {voter.full_name or voter.college_email} has no USN (student_id). "
            "Add USN before uploading face photo."
        )
    return sanitize_department(department), sanitize_usn(student_id)


async def save_voter_face_image(
    voter: Voter,
    image_data: bytes,
    filename: str,
    content_type: str,
    *,
    pending: bool = False,
) -> FaceSaveResult:
    """
    Persist face image using department/USN layout.
    Uses Supabase when configured, otherwise local disk.
    """
    if not image_data:
        raise FaceStorageError("Empty image data.")

    dept, usn = _validate_voter_for_face_upload(voter)
    extension = _extension_from_filename(filename)
    object_path = build_object_path(
        dept, usn, voter.voter_id, extension, pending=pending
    )

    supabase_enabled = bool(settings.supabase_project_url and settings.SUPABASE_SERVICE_ROLE_KEY)
    if supabase_enabled:
        try:
            uploaded: UploadedStorageObject = await _do_upload(
                object_path=object_path,
                filename=filename or f"face{extension}",
                content_type=content_type or "image/jpeg",
                data=image_data,
            )
            return FaceSaveResult(
                reference_url=uploaded.public_url,
                relative_path=object_path,
                object_path=object_path,
            )
        except SupabaseStorageError:
            raise

    local_path = build_local_filesystem_path(object_path)
    parent = os.path.dirname(local_path)
    os.makedirs(parent, exist_ok=True)

    abs_parent = os.path.abspath(parent)
    abs_target = os.path.abspath(local_path)
    if not abs_target.startswith(abs_parent):
        raise FaceStorageError("Path traversal blocked.")

    try:
        with open(local_path, "wb") as f:
            f.write(image_data)
    except OSError as e:
        logger.error(f"Failed to write face image to {local_path}: {e}")
        raise FaceStorageError("Failed to save image file.") from e

    ref_url = reference_url_from_object_path(object_path)
    return FaceSaveResult(
        reference_url=ref_url,
        relative_path=local_path,
        object_path=object_path,
    )


def is_already_usn_layout(reference_url: Optional[str]) -> bool:
    if not reference_url:
        return False
    path = reference_url
    if path.startswith("http"):
        # Supabase: faces/DEPT/USN_hash.ext
        marker = "/faces/"
        idx = path.find(marker)
        if idx == -1:
            return False
        tail = path[idx + len(marker) :]
        parts = tail.split("/")
        return len(parts) >= 2 and "_" in parts[-1]
    local = resolve_local_path(path) or path.lstrip("/")
    parts = local.replace("\\", "/").split("/")
    # uploads/faces/DEPT/file.jpg
    if len(parts) >= 4 and parts[-3] == "faces":
        name = parts[-1]
        return "_" in name and not name.startswith("student_")
    return False
