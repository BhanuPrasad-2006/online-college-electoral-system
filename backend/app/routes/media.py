import os
import uuid
import html
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import joinedload

from app.db.session import get_db
from app.api.deps import get_current_user, get_candidate_user, get_admin_user, require_admin_roles
from app.models.campaign_media import CampaignMedia
from app.models.candidate import Candidate
from app.models.voter import Voter
from app.enums.roles import UserRoleEnum
from app.core.config import settings
from app.services.supabase_storage import SupabaseStorageError, upload_campaign_media
from app.utils.image_validator import validate_image
from app.utils.logger import logger

router = APIRouter()

UPLOAD_DIR = "uploads/media"

ALLOWED_EXTENSIONS = {
    "image": {".png", ".jpg", ".jpeg"},
    "video": {".mp4"}
}

ALLOWED_MIMETYPES = {
    "image": {"image/png", "image/jpeg"},
    "video": {"video/mp4"}
}

# Max sizes
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB
MAX_VIDEO_SIZE = 20 * 1024 * 1024  # 20MB


def map_db_status_to_frontend(db_status) -> str:
    """Helper to match frontend expected capitalization."""
    status_str = str(db_status).upper().strip()
    mapping = {
        "PENDING": "Pending",
        "APPROVED": "Approved",
        "REJECTED": "Rejected"
    }
    return mapping.get(status_str, "Pending")


@router.get("/", response_model=List[dict], status_code=status.HTTP_200_OK)
async def list_media_items(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    List campaign media items based on user role:
    - Admin: all items
    - Candidate: approved items + candidate's own items
    - Voter: only approved items
    """
    role = current_user.get("role")
    user_id_str = current_user.get("user_id")
    
    try:
        user_uuid = uuid.UUID(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format in credentials token."
        )

    # Base query joining Candidate and Voter to fetch name and party info
    query = (
        select(CampaignMedia)
        .options(
            joinedload(CampaignMedia.candidate).joinedload(Candidate.voter)
        )
    )

    if role == UserRoleEnum.ADMIN:
        # Admin can view all media items
        pass
    elif role == UserRoleEnum.CANDIDATE:
        # Find candidate record for this logged in user
        cand_res = await db.execute(
            select(Candidate).where(
                or_(
                    Candidate.candidate_id == user_uuid,
                    Candidate.voter_id == user_uuid
                )
            )
        )
        candidate = cand_res.scalar_one_or_none()
        if not candidate:
            # If no candidate record, treat as voter (only see approved)
            query = query.where(CampaignMedia.status == "APPROVED")
        else:
            # Candidate sees APPROVED items OR their own submissions
            query = query.where(
                or_(
                    CampaignMedia.status == "APPROVED",
                    CampaignMedia.candidate_id == candidate.candidate_id
                )
            )
    else:
        # Voter sees only APPROVED items
        query = query.where(CampaignMedia.status == "APPROVED")

    res = await db.execute(query.order_by(CampaignMedia.submitted_at.desc()))
    media_items = res.scalars().all()

    results = []
    for item in media_items:
        cand = item.candidate
        voter = cand.voter if cand else None
        
        # Format dates
        sub_time = item.submitted_at.isoformat() if item.submitted_at else "—"
        rev_time = item.reviewed_at.isoformat() if item.reviewed_at else None

        results.append({
            "id": str(item.media_id),
            "candidateId": str(item.candidate_id),
            "candidateName": voter.full_name if voter else "Unknown Candidate",
            "type": item.type,
            "title": item.title,
            "uploadedFileUrl": item.uploaded_file_url,
            "externalUrl": item.external_url,
            "body": item.body,
            "status": map_db_status_to_frontend(item.status),
            "submittedAt": sub_time,
            "reviewedBy": str(item.reviewed_by) if item.reviewed_by else None,
            "reviewedAt": rev_time,
            "rejectionReason": item.rejection_reason
        })

    return results


@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED)
async def submit_media(
    type: str = Form(...),
    title: str = Form(...),
    external_url: Optional[str] = Form(None),
    body: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    current_candidate: dict = Depends(get_candidate_user)
):
    """
    Submit a campaign media item (only allowed for registered candidates).
    Performs strict file validations: MIME-type, extension, and max size.
    """
    user_id_str = current_candidate.get("user_id")
    try:
        user_uuid = uuid.UUID(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format."
        )

    # 1. Verify candidate profile exists
    cand_res = await db.execute(
        select(Candidate).where(
            or_(
                Candidate.candidate_id == user_uuid,
                Candidate.voter_id == user_uuid
            )
        )
    )
    candidate = cand_res.scalar_one_or_none()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Candidacy record not found. You must be an approved candidate to submit media."
        )

    # Phase Lock Check (Campaign Period Deadline - past when voting starts)
    from app.services.phase_engine import PhaseEngine
    from app.models.election import Election
    elec_res = await db.execute(select(Election).order_by(Election.created_at.desc()))
    election = elec_res.scalars().first()
    if election:
        phase = PhaseEngine.get_current_phase(election)
        if phase in ["voting_open", "voting_closed", "results_announced"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Campaign media uploads are locked once voting starts."
            )

    # 2. Check candidate application status (must be approved candidate)
    if candidate.status != "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your candidate profile is not approved yet. Only approved candidates can submit media."
        )

    # Validate type
    media_type = type.lower().strip()
    if media_type not in ["video", "poster", "message"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid media type: {type}. Allowed values: video, poster, message"
        )

    uploaded_url = None

    # 3. File upload & validation
    if file:
        filename = file.filename
        content_type = file.content_type
        
        # Check extensions
        file_ext = os.path.splitext(filename)[1].lower()
        
        # Verify allowed image/video formats
        is_valid_ext = False
        is_valid_mime = False
        max_size = MAX_IMAGE_SIZE

        if media_type == "poster":
            is_valid_ext = file_ext in ALLOWED_EXTENSIONS["image"]
            is_valid_mime = content_type in ALLOWED_MIMETYPES["image"]
            max_size = MAX_IMAGE_SIZE
        elif media_type == "video":
            is_valid_ext = file_ext in ALLOWED_EXTENSIONS["video"]
            is_valid_mime = content_type in ALLOWED_MIMETYPES["video"]
            max_size = MAX_VIDEO_SIZE
        else:
            # message type shouldn't have file uploads
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File upload is not allowed for plain text messages."
            )

        if not is_valid_ext or not is_valid_mime:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Security rejection: Invalid file format or MIME type. Only PNG/JPEG images or MP4 videos are allowed."
            )

        # File content check (block HTML / executable code headers)
        file_data = await file.read()
        file_len = len(file_data)
        
        if file_len > max_size:
            max_size_mb = max_size / (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File exceeds maximum allowed size of {max_size_mb}MB."
            )
            
        # Malware signature/code checks: verify no <script>, <?php, html headers, etc.
        suspicious_signatures = [b"<script", b"<?php", b"<% ", b"exec(", b"eval(", b"<!DOCTYPE html", b"<html>"]
        for sig in suspicious_signatures:
            if sig in file_data[:4096]:  # Check header bytes
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Security rejection: File contains disallowed scripts or code signatures."
                )

        # AI-generated image detection for images
        if content_type and content_type.startswith("image/"):
            validation = validate_image(file_data, filename)
            if not validation.passed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=validation.reason,
                )

        supabase_enabled = bool(settings.supabase_project_url and settings.SUPABASE_SERVICE_ROLE_KEY)
        if supabase_enabled:
            try:
                uploaded = await upload_campaign_media(
                    candidate_id=str(candidate.candidate_id),
                    media_type=media_type,
                    filename=filename,
                    content_type=content_type,
                    data=file_data,
                )
                uploaded_url = uploaded.public_url
            except SupabaseStorageError as exc:
                logger.error(f"Supabase upload failed: {exc}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=str(exc),
                )
        else:
            os.makedirs(UPLOAD_DIR, exist_ok=True)
            unique_name = f"media_{uuid.uuid4()}{file_ext}"
            file_path = os.path.join(UPLOAD_DIR, unique_name)

            try:
                with open(file_path, "wb") as f:
                    f.write(file_data)
            except Exception as e:
                logger.error(f"Failed to write campaign media file: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to save uploaded file on the server."
                )

            uploaded_url = f"/{UPLOAD_DIR}/{unique_name}"

    elif media_type in ["video", "poster"] and not external_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A file upload or an external URL is required for video/poster campaign media."
        )

    # 4. Create CampaignMedia record
    media_item = CampaignMedia(
        candidate_id=candidate.candidate_id,
        type=media_type,
        title=html.escape(title.strip()),
        uploaded_file_url=uploaded_url,
        external_url=html.escape(external_url.strip()) if external_url else None,
        body=html.escape(body.strip()) if body else None,
        status="PENDING"
    )

    db.add(media_item)
    await db.commit()
    await db.refresh(media_item)

    return {
        "success": True,
        "message": "Campaign media submitted successfully for admin review.",
        "media_id": str(media_item.media_id),
        "status": "Pending"
    }


@router.put("/{media_id}/status", response_model=dict, status_code=status.HTTP_200_OK)
async def update_media_status(
    media_id: str,
    status_update: str = Form(...),
    rejection_reason: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(require_admin_roles(["SUPER_ADMIN", "CANDIDATE_MODERATOR"]))
):
    """
    Approve or Reject a campaign media item (Admin only).
    Logs the reviewer details.
    """
    admin_id_str = current_admin.get("user_id")
    try:
        media_uuid = uuid.UUID(media_id)
        admin_uuid = uuid.UUID(admin_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid UUID format."
        )

    # 1. Fetch Campaign Media record
    query = select(CampaignMedia).where(CampaignMedia.media_id == media_uuid)
    res = await db.execute(query)
    media_item = res.scalar_one_or_none()
    if not media_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign media item not found."
        )

    # 2. Validate input status
    input_status = status_update.upper().strip()
    if input_status not in ["APPROVED", "REJECTED", "PENDING"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be APPROVED, REJECTED, or PENDING."
        )

    # 3. Save updates
    media_item.status = input_status
    media_item.reviewed_by = admin_uuid
    media_item.reviewed_at = datetime.now(timezone.utc)
    
    if input_status == "REJECTED":
        media_item.rejection_reason = html.escape(rejection_reason.strip()) if rejection_reason else "No reason provided."
    else:
        media_item.rejection_reason = None

    await db.commit()

    return {
        "success": True,
        "message": f"Campaign media status updated to {input_status}.",
        "media_id": str(media_item.media_id),
        "status": map_db_status_to_frontend(media_item.status)
    }
