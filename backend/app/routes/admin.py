import os
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.api.deps import get_admin_user
from app.models.admin_user import AdminUser
from app.models.voter import Voter
from app.services.face_service import extract_face_embedding, serialize_embedding
from app.utils.logger import logger

router = APIRouter()

UPLOAD_DIR = "uploads/faces"

@router.post("/voters/{voter_id}/upload-face")
async def upload_voter_face(
    voter_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user)
):
    """
    Admin endpoint to upload a reference ID photo for a student.
    Extracts face embedding and saves it to DB.
    """
    # 1. Verify user is admin is handled by get_admin_user dependency
        
    # 2. Validate file type and size
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Only images are allowed.")
        
    image_data = await file.read()
    if len(image_data) > 5 * 1024 * 1024:  # 5MB
        raise HTTPException(status_code=400, detail="Image size exceeds 5MB limit.")
        
    # 3. Find voter
    result = await db.execute(select(Voter).where(Voter.voter_id == voter_id))
    voter = result.scalars().first()
    if not voter:
        raise HTTPException(status_code=404, detail="Voter not found.")
        
    # 4. Process with AI Service
    try:
        embedding = extract_face_embedding(image_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    # 5. Save the file
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_ext = os.path.splitext(file.filename)[1] or ".jpg"
    safe_filename = f"student_{voter_id}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    try:
        with open(file_path, "wb") as f:
            f.write(image_data)
    except Exception as e:
        logger.error(f"Failed to save face image: {e}")
        raise HTTPException(status_code=500, detail="Failed to save image file.")
        
    # 6. Save to DB
    voter.reference_image_url = f"/{file_path.replace(os.sep, '/')}"
    voter.face_encoding = serialize_embedding(embedding)
    
    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to commit face embedding: {e}")
        raise HTTPException(status_code=500, detail="Database error while saving face data.")
        
    return {
        "success": True,
        "message": "Face enrolled successfully",
        "reference_image_url": voter.reference_image_url
    }


# ==============================================================================
# SECURITY MONITORING & LEDGER INTEGRITY (Phase 5)
# ==============================================================================
@router.get("/verify-ledger")
async def verify_ledger(
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user)
):
    """Verify cryptographic chain continuity and cross-reference with secure vault."""
    from app.services.ledger_service import verify_ledger_integrity
    results = await verify_ledger_integrity(db)
    return results


@router.get("/ai-alerts")
async def get_ai_alerts(
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user)
):
    """Fetch active/all behavioral anomaly and honeypot alerts."""
    from app.security.fraud_detection_service import FraudDetectionService
    service = FraudDetectionService()
    alerts = await service.get_alerts(db)
    return alerts


@router.put("/ai-alerts/{alert_id}/resolve")
async def resolve_ai_alert(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user)
):
    """Resolve a behavioral alert."""
    from app.security.fraud_detection_service import FraudDetectionService
    service = FraudDetectionService()
    resolver = current_admin.get("email") or current_admin.get("username") or "admin"
    success = await service.resolve_alert(db, alert_id, resolver)
    if not success:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"message": "Alert resolved successfully", "alert_id": alert_id}


@router.get("/audit-logs")
async def get_audit_logs(
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user)
):
    """Query system logs for forensic auditing."""
    from app.models.audit_log import AuditLog
    query = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(100)
    result = await db.execute(query)
    logs = result.scalars().all()
    
    return [
        {
            "id": str(log.log_id),
            "ts": log.created_at.strftime("%Y-%m-%d %H:%M:%S") if log.created_at else None,
            "event": log.event_type,
            "actor": str(log.actor_id) if log.actor_id else "anonymous",
            "ip": str(log.ip_address) if log.ip_address else "unknown",
            "desc": log.description,
            "level": "security" if "FAILED" in log.event_type or "ALERT" in log.event_type or "HONEYPOT" in log.event_type else "success"
        }
        for log in logs
    ]

