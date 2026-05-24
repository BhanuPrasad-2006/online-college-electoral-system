"""Concerns routes — manage student concerns with AI classification."""

import os
import uuid as uuid_mod
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.db.session import get_db
from app.api.deps import get_current_user, get_candidate_user
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.manifesto import Manifesto
from app.services.concern_service import ConcernService
from app.services.supabase_storage import (
    SupabaseStorageError,
    upload_concern_attachment,
)
from app.core.config import settings
from app.utils.logger import logger

router = APIRouter()

# Max file size: 10MB
MAX_CONCERN_FILE_SIZE = 10 * 1024 * 1024

ALLOWED_CONCERN_MIMETYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/webm",
    "video/quicktime",
}

ALLOWED_CONCERN_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".mov"}


class ConcernCreateRequest(BaseModel):
    """Request model for creating a new concern."""
    to_candidate_id: Optional[str] = None
    category: str = "other"
    subject: str
    message: str
    attachment_url: Optional[str] = None


class ConcernUpvoteRequest(BaseModel):
    """Request model for upvoting a concern."""
    concern_id: str


@router.post("/upload", status_code=status.HTTP_200_OK)
async def upload_concern_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload a concern attachment (image or video) to Supabase Storage.
    Returns the public URL to include in the concern creation request.
    """
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    # Validate file presence
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided.",
        )

    # Validate extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_CONCERN_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file extension '{ext}'. Allowed: {', '.join(sorted(ALLOWED_CONCERN_EXTENSIONS))}",
        )

    # Validate MIME type
    if file.content_type not in ALLOWED_CONCERN_MIMETYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type '{file.content_type}'. Allowed images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV).",
        )

    # Read file data
    file_data = await file.read()
    if len(file_data) > MAX_CONCERN_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File exceeds maximum allowed size of 10MB.",
        )

    # Check for malicious content in header bytes
    suspicious_signatures = [b"<script", b"<?php", b"<% ", b"exec(", b"eval("]
    for sig in suspicious_signatures:
        if sig in file_data[:4096]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Security rejection: File contains disallowed content.",
            )

    # Upload to Supabase (or local fallback)
    supabase_enabled = bool(settings.supabase_project_url and settings.SUPABASE_SERVICE_ROLE_KEY)
    if supabase_enabled:
        try:
            uploaded = await upload_concern_attachment(
                voter_id=voter_id,
                filename=file.filename,
                content_type=file.content_type,
                data=file_data,
            )
            return {"url": uploaded.public_url, "path": uploaded.path}
        except SupabaseStorageError as exc:
            logger.error(f"Supabase concern attachment upload failed: {exc}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to upload file. Please try again.",
            )
    else:
        # Local fallback for development
        upload_dir = "uploads/concerns"
        os.makedirs(upload_dir, exist_ok=True)
        unique_name = f"{uuid_mod.uuid4().hex}{ext}"
        file_path = os.path.join(upload_dir, unique_name)
        try:
            with open(file_path, "wb") as f:
                f.write(file_data)
            local_url = f"/{upload_dir}/{unique_name}"
            return {"url": local_url, "path": local_url}
        except Exception as e:
            logger.error(f"Failed to save concern attachment locally: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save uploaded file.",
            )

@router.get("/", status_code=status.HTTP_200_OK)
async def list_concerns(
    page: int = 1,
    page_size: int = 20,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all concerns with pagination."""
    service = ConcernService(db)
    election_result = await db.execute(select(Election).order_by(Election.created_at.desc()))
    election = election_result.scalars().first()
    election_id = str(election.election_id) if election else None
    result = await service.list_concerns(page=page, page_size=page_size, election_id=election_id)
    return result


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_concern(
    body: ConcernCreateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new concern."""
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    service = ConcernService(db)
    try:
        result = await service.create(
            user_id=voter_id,
            title=body.subject,
            description=body.message,
            category=body.category,
            candidate_id=body.to_candidate_id,
            attachment_url=body.attachment_url,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/categories", status_code=status.HTTP_200_OK)
async def get_concern_categories(
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated concern categories with counts and sentiment breakdown."""
    service = ConcernService(db)
    return await service.get_report()


@router.post("/upvote", status_code=status.HTTP_200_OK)
async def upvote_concern(
    body: ConcernUpvoteRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upvote a concern."""
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    service = ConcernService(db)
    try:
        result = await service.upvote(body.concern_id, voter_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/report", status_code=status.HTTP_200_OK)
async def get_concern_report(
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated concern report by category."""
    service = ConcernService(db)
    categories = await service.get_report()
    return {
        "categories": categories,
        "overall": ConcernService.compute_overall_sentiment(categories),
    }


@router.get("/candidate-report", status_code=status.HTTP_200_OK)
async def get_candidate_concern_report(
    current_user: dict = Depends(get_candidate_user),
    db: AsyncSession = Depends(get_db),
):
    """Concern analysis with manifesto coverage for the logged-in candidate."""
    import uuid as uuid_mod

    user_id = current_user.get("user_id")
    try:
        voter_uuid = uuid_mod.UUID(user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user id")

    cand_res = await db.execute(select(Candidate).where(Candidate.voter_id == voter_uuid))
    candidate = cand_res.scalar_one_or_none()
    manifesto_text = ""
    if candidate:
        man_res = await db.execute(
            select(Manifesto).where(Manifesto.candidate_id == candidate.candidate_id)
        )
        manifesto = man_res.scalar_one_or_none()
        manifesto_text = manifesto.content if manifesto else ""

    service = ConcernService(db)
    categories = await service.get_report(manifesto_text=manifesto_text)
    return {
        "categories": categories,
        "overall": ConcernService.compute_overall_sentiment(categories),
    }
