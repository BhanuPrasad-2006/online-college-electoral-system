import os
import uuid
from typing import Optional
from collections import Counter
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.api.deps import get_admin_user
from app.models.admin_user import AdminUser
from app.models.voter import Voter
from app.models.concern import Concern
from app.enums.concern_enums import ConcernCategoryEnum
from app.services.face_service import extract_face_embedding, serialize_embedding
from app.services.ai_proxy_service import AIProxyService
from app.services.supabase_storage import (
    SupabaseStorageError,
    upload_voter_face as supabase_upload_voter_face,
)
from app.utils.image_validator import validate_image
from app.utils.logger import logger
from app.core.config import settings
from app.middleware.rate_limit import limiter
import asyncio

router = APIRouter()

# Development-only helper: allow unauthenticated upload for testing local dev
if settings.APP_ENV == "development":
    @router.post("/debug/voters/{voter_id}/upload-face")
    async def debug_upload_voter_face(
        voter_id: str,
        file: UploadFile = File(...),
        db: AsyncSession = Depends(get_db),
    ):
        # Reuse same logic as upload_voter_face but without admin dependency
        # Phase gate intentionally skipped for dev
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Invalid file type. Only images are allowed.")
        image_data = await file.read()
        if len(image_data) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image size exceeds 5MB limit.")
        validation = validate_image(image_data, file.filename or "face.jpg")
        if not validation.passed:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=validation.reason)
        result = await db.execute(select(Voter).where(Voter.voter_id == voter_id))
        voter = result.scalars().first()
        if not voter:
            raise HTTPException(status_code=404, detail="Voter not found.")
        try:
            embedding = extract_face_embedding(image_data)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except RuntimeError as e:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
        # local save
        file_ext = os.path.splitext(file.filename)[1] or ".jpg"
        safe_filename = f"student_{voter_id}{file_ext}"
        file_path = os.path.join("uploads/faces", safe_filename)
        os.makedirs("uploads/faces", exist_ok=True)
        try:
            with open(file_path, "wb") as f:
                f.write(image_data)
            voter.reference_image_url = f"/{file_path.replace(os.sep, '/')}"
        except Exception as e:
            logger.error(f"Failed to save face image: {e}")
            raise HTTPException(status_code=500, detail="Failed to save image file.")
        voter.face_encoding = serialize_embedding(embedding)
        try:
            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to commit face embedding: {e}")
            raise HTTPException(status_code=500, detail="Database error while saving face data.")
        return {"success": True, "message": "Face uploaded (debug)", "reference_image_url": voter.reference_image_url}


@router.post("/voters/{voter_id}/upload-face")
async def upload_voter_face(
    voter_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user)
):
    """
    Admin endpoint to upload a reference ID photo for a student.
    Photo uploads are blocked during/after voting to prevent impersonation.
    Extracts face embedding and saves it to DB.
    """
    # 1. Verify user is admin is handled by get_admin_user dependency

    # Phase gate — block photo uploads only after election is fully closed/results published
    from app.models.election import Election
    from app.enums.election_status import ElectionStatusEnum
    election_result = await db.execute(
        select(Election).order_by(Election.created_at.desc()).limit(1)
    )
    election = election_result.scalars().first()
    # NOTE: previously uploads were blocked when election results were announced.
    # For admin tooling during development, allow admin uploads regardless of election status.
    # If you want to re-enable the phase gate, restore the check below.
        
    # 2. Validate file type and size
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Only images are allowed.")
        
    image_data = await file.read()
    if len(image_data) > 5 * 1024 * 1024:  # 5MB
        raise HTTPException(status_code=400, detail="Image size exceeds 5MB limit.")
        
    # 3. Validate image (block AI-generated / malicious content)
    validation = validate_image(image_data, file.filename or "face.jpg")
    if not validation.passed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=validation.reason)

    # 4. Find voter
    result = await db.execute(select(Voter).where(Voter.voter_id == voter_id))
    voter = result.scalars().first()
    if not voter:
        raise HTTPException(status_code=404, detail="Voter not found.")
        
    # 5. Process with AI Service
    try:
        embedding = extract_face_embedding(image_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
        
    # 6. Upload to Supabase Storage (with local fallback)
    supabase_enabled = bool(settings.supabase_project_url and settings.SUPABASE_SERVICE_ROLE_KEY)
    if supabase_enabled:
        try:
            uploaded = await supabase_upload_voter_face(
                voter_id=voter_id,
                filename=file.filename or "face.jpg",
                content_type=file.content_type or "image/jpeg",
                data=image_data,
            )
            voter.reference_image_url = uploaded.public_url
        except SupabaseStorageError as exc:
            logger.error(f"Supabase face upload failed: {exc}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to upload face image to storage. Please try again.",
            )
    else:
        # Local fallback for development
        file_ext = os.path.splitext(file.filename)[1] or ".jpg"
        safe_filename = f"student_{voter_id}{file_ext}"
        file_path = os.path.join("uploads/faces", safe_filename)
        os.makedirs("uploads/faces", exist_ok=True)
        try:
            with open(file_path, "wb") as f:
                f.write(image_data)
            voter.reference_image_url = f"/{file_path.replace(os.sep, '/')}"
        except Exception as e:
            logger.error(f"Failed to save face image: {e}")
            raise HTTPException(status_code=500, detail="Failed to save image file.")
    
    # 7. Save face encoding to DB
    voter.face_encoding = serialize_embedding(embedding)
    
    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to commit face embedding: {e}")
        raise HTTPException(status_code=500, detail="Database error while saving face data.")
        
    return {
        "success": True,
        "message": "Face uploaded successfully",
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


def _compute_audit_level(event: str) -> str:
    """Classify audit event severity based on keywords."""
    upper = event.upper()
    if any(k in upper for k in ["FAILED", "ERROR", "REJECTED", "HONEYPOT"]):
        return "security"
    if any(k in upper for k in ["ALERT", "WARNING", "SUSPICIOUS"]):
        return "warning"
    return "success"


@router.get("/audit-logs")
async def get_audit_logs(
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user),
    skip: int = 0,
    limit: int = 50,
    event_type: Optional[str] = None,
    actor: Optional[str] = None,
    ip: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    q: Optional[str] = None,
):
    """
    Query system logs for forensic auditing with pagination and filters.

    - skip / limit: pagination (default 0 / 50, max limit 200)
    - event_type: filter by exact event type (e.g. LOGIN_SUCCESS, VOTE_CAST)
    - actor: partial-match filter on actor_id (UUID string representation)
    - ip: partial-match filter on ip_address
    - date_from / date_to: ISO date range filter (inclusive)
    - q: catch-all search across description
    """
    from app.models.audit_log import AuditLog
    from sqlalchemy import func, cast, String
    from datetime import datetime

    limit = min(limit, 200)

    # Count query
    count_query = select(func.count(AuditLog.log_id))

    # Data query
    data_query = select(AuditLog).order_by(AuditLog.created_at.desc())

    if event_type:
        count_query = count_query.where(AuditLog.event_type == event_type)
        data_query = data_query.where(AuditLog.event_type == event_type)
    if actor:
        pattern = f"%{actor}%"
        count_query = count_query.where(cast(AuditLog.actor_id, String).ilike(pattern))
        data_query = data_query.where(cast(AuditLog.actor_id, String).ilike(pattern))
    if ip:
        pattern = f"%{ip}%"
        count_query = count_query.where(AuditLog.ip_address.ilike(pattern))
        data_query = data_query.where(AuditLog.ip_address.ilike(pattern))
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from)
            count_query = count_query.where(AuditLog.created_at >= dt_from)
            data_query = data_query.where(AuditLog.created_at >= dt_from)
        except ValueError:
            pass
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to)
            count_query = count_query.where(AuditLog.created_at <= dt_to)
            data_query = data_query.where(AuditLog.created_at <= dt_to)
        except ValueError:
            pass
    if q:
        pattern = f"%{q}%"
        count_query = count_query.where(AuditLog.description.ilike(pattern))
        data_query = data_query.where(AuditLog.description.ilike(pattern))

    # Execute count
    total_result = await db.execute(count_query)
    total_count = total_result.scalar() or 0

    # Execute paginated data
    data_query = data_query.offset(skip).limit(limit)
    result = await db.execute(data_query)
    logs = result.scalars().all()

    return {
        "logs": [
            {
                "id": str(log.log_id),
                "ts": log.created_at.strftime("%Y-%m-%d %H:%M:%S") if log.created_at else None,
                "ts_iso": log.created_at.isoformat() if log.created_at else None,
                "event": log.event_type,
                "actor": str(log.actor_id) if log.actor_id else "anonymous",
                "ip": str(log.ip_address) if log.ip_address else "unknown",
                "desc": log.description,
                "level": _compute_audit_level(log.event_type),
            }
            for log in logs
        ],
        "total": total_count,
        "skip": skip,
        "limit": limit,
    }


@router.get("/audit-logs/{log_id}")
async def get_audit_log_detail(
    log_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user),
):
    """Return full details for a single audit log entry."""
    from app.models.audit_log import AuditLog
    import uuid

    try:
        uid = uuid.UUID(log_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid log ID format")

    result = await db.execute(select(AuditLog).where(AuditLog.log_id == uid))
    log = result.scalars().first()
    if not log:
        raise HTTPException(status_code=404, detail="Audit log not found")

    return {
        "id": str(log.log_id),
        "ts": log.created_at.strftime("%Y-%m-%d %H:%M:%S") if log.created_at else None,
        "ts_iso": log.created_at.isoformat() if log.created_at else None,
        "event": log.event_type,
        "actor": str(log.actor_id) if log.actor_id else "anonymous",
        "ip": str(log.ip_address) if log.ip_address else "unknown",
        "desc": log.description,
        "level": _compute_audit_level(log.event_type),
    }


# ==============================================================================
# CLUSTERED CONCERNS VIEW (Feature #3 UI)
# ==============================================================================
@router.get("/clustered-concerns")
async def get_clustered_concerns(
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user),
):
    """Return all concerns grouped by cluster_id with aggregate metadata."""
    result = await db.execute(
        select(Concern).order_by(Concern.submitted_at.desc())
    )
    all_concerns = result.scalars().all()

    # Group by cluster_id
    groups: dict[str, list[Concern]] = {}
    for concern in all_concerns:
        cid = concern.cluster_id or "__unclustered__"
        if cid not in groups:
            groups[cid] = []
        groups[cid].append(concern)

    clusters = []
    for cluster_id, concerns in groups.items():
        size = len(concerns)
        # Representative texts: first 3 by recency
        sorted_concerns = sorted(concerns, key=lambda c: c.submitted_at or "", reverse=True)
        representative_texts = [
            c.content[:200] for c in sorted_concerns[:3]
        ]

        # Category distribution (from ConcernCategoryEnum)
        cat_dist: dict[str, int] = {}
        # Sentiment breakdown
        sent_breakdown: dict[str, int] = {"positive": 0, "neutral": 0, "negative": 0}
        for c in concerns:
            cat_label = c.category.value if c.category else "unknown"
            cat_dist[cat_label] = cat_dist.get(cat_label, 0) + 1

            if c.sentiment:
                s = c.sentiment.value.lower()
                if s in sent_breakdown:
                    sent_breakdown[s] += 1

        clusters.append({
            "cluster_id": cluster_id if cluster_id != "__unclustered__" else None,
            "is_unclustered": cluster_id == "__unclustered__",
            "size": size,
            "representative_texts": representative_texts,
            "category_distribution": cat_dist,
            "sentiment_breakdown": sent_breakdown,
            "concerns": [
                {
                    "concern_id": str(c.concern_id),
                    "content": c.content,
                    "category": c.category.value if c.category else "unknown",
                    "sentiment": c.sentiment.value if c.sentiment else "neutral",
                    "priority": c.priority,
                    "to_candidate_id": c.to_candidate_id,
                    "submitted_at": c.submitted_at.isoformat() if c.submitted_at else None,
                    "subject": c.subject,
                    "message": c.message,
                    "evidence_url": c.evidence_url,
                    "status": c.status,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                }
                for c in sorted_concerns
            ],
        })

    # Sort: clustered groups first (by size desc), then unclustered
    clusters.sort(key=lambda g: (g["is_unclustered"], -g["size"]))

    return {
        "clusters": clusters,
        "total_concerns": len(all_concerns),
        "total_clusters": len([g for g in groups if g != "__unclustered__"]),
        "unclustered_count": len(groups.get("__unclustered__", [])),
    }


# ==============================================================================
# CONCERN CLUSTERING (Feature #3)
# ==============================================================================
@router.post("/cluster-concerns")
async def cluster_concerns(
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user)
):
    """Cluster all unclustered concerns using AI and assign cluster_ids."""
    from app.models.audit_log import AuditLog
    from datetime import datetime, timezone
    
    # Fetch concerns that don't have a cluster_id yet
    result = await db.execute(
        select(Concern).where(Concern.cluster_id.is_(None))
    )
    unclustered = result.scalars().all()
    
    if not unclustered:
        return {"message": "All concerns are already clustered", "clustered": 0}
    
    texts = [c.content for c in unclustered if c.content]
    
    if not texts:
        return {"message": "No concern content to cluster", "clustered": 0}
    
    try:
        proxy = AIProxyService()
        cluster_result = await proxy.cluster_concerns(texts)
    except Exception as e:
        logger.warning(f"AI clustering failed, using local fallback: {e}")
        # Local fallback: simple categorization by ConcernCategoryEnum
        cluster_result = {"clusters": [], "num_clusters": 0}
    
    # Build a mapping from concern text to cluster_id
    text_to_cluster_id: dict[str, int] = {}
    for cluster in cluster_result.get("clusters", []):
        cid = cluster.get("cluster_id")
        for concern_text in cluster.get("concerns", []):
            text_to_cluster_id[concern_text] = cid
    
    # Assign cluster_ids to concerns
    assigned_count = 0
    for concern in unclustered:
        if concern.content in text_to_cluster_id:
            concern.cluster_id = str(text_to_cluster_id[concern.content])
            assigned_count += 1
        else:
            # Unclustered items get standalone cluster_id based on their index
            concern.cluster_id = f"singleton_{concern.concern_id[:8]}"
    
    await db.commit()
    
    # Audit log
    audit_entry = AuditLog(
        event_type="CONCERN_CLUSTERING",
        actor_id=current_admin.get("user_id"),
        description=f"Clustered {assigned_count} concerns into {cluster_result.get('num_clusters', 0)} groups",
        created_at=datetime.now(timezone.utc)
    )
    db.add(audit_entry)
    await db.commit()
    
    return {
        "message": f"Clustered {len(unclustered)} concerns",
        "clustered": len(unclustered),
        "groups": cluster_result.get("num_clusters", 0),
    }


# ==============================================================================
# STATE OF THE CAMPUS REPORT (Feature #10)
# ==============================================================================
@router.get("/campus-report")
async def get_campus_report(
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user),
):
    """
    Generate a comprehensive 'State of the Campus' report.
    Aggregates concern data, computes statistics, and optionally enriches with AI narrative.
    """
    from datetime import datetime, timezone
    from collections import Counter

    # 1. Fetch all concerns
    result = await db.execute(
        select(Concern).order_by(Concern.submitted_at.desc())
    )
    all_concerns = result.scalars().all()
    total = len(all_concerns)

    # 2. Compute aggregate stats
    cat_dist: dict[str, int] = {}
    sent_dist = {"positive": 0, "neutral": 0, "negative": 0}
    sent_scores: list[float] = []
    priority_sum = 0
    date_range = {"earliest": None, "latest": None}

    # Group by cluster
    groups: dict[str, list[Concern]] = {}
    for concern in all_concerns:
        cid = concern.cluster_id or "__unclustered__"
        if cid not in groups:
            groups[cid] = []
        groups[cid].append(concern)

        cat_label = concern.category.value if concern.category else "unknown"
        cat_dist[cat_label] = cat_dist.get(cat_label, 0) + 1

        if concern.sentiment:
            s = concern.sentiment.value.lower()
            if s in sent_dist:
                sent_dist[s] += 1

        priority_sum += concern.priority or 2

        if concern.submitted_at:
            ts = concern.submitted_at
            if date_range["earliest"] is None or ts < date_range["earliest"]:
                date_range["earliest"] = ts
            if date_range["latest"] is None or ts > date_range["latest"]:
                date_range["latest"] = ts

    avg_priority = round(priority_sum / max(total, 1), 1)

    # 3. Build cluster summary
    cluster_summaries = []
    for cluster_id, concerns in groups.items():
        size = len(concerns)
        sorted_c = sorted(concerns, key=lambda c: c.submitted_at or "", reverse=True)
        cluster_summaries.append({
            "cluster_id": cluster_id if cluster_id != "__unclustered__" else None,
            "is_unclustered": cluster_id == "__unclustered__",
            "size": size,
            "category": max(
                [c.category.value if c.category else "unknown" for c in concerns],
                key=lambda c: [c.category.value if c.category else "unknown" for c in concerns].count(c)
            ) if concerns else "unknown",
            "representative_texts": [c.content[:200] for c in sorted_c[:3]],
        })
    cluster_summaries.sort(key=lambda g: (-g["size"], g["is_unclustered"]))

    # 4. Build concise data payload for AI service
    concern_data = {
        "total_concerns": total,
        "total_clusters": len([g for g in groups if g != "__unclustered__"]),
        "unclustered_count": len(groups.get("__unclustered__", [])),
        "category_distribution": cat_dist,
        "sentiment_summary": sent_dist,
        "clusters": cluster_summaries,
        "date_range": {
            "earliest": date_range["earliest"].isoformat() if date_range["earliest"] else None,
            "latest": date_range["latest"].isoformat() if date_range["latest"] else None,
        },
        "avg_priority": avg_priority,
    }

    # 5. Generate AI narrative (with fallback)
    ai_narrative = None
    try:
        proxy = AIProxyService()
        ai_narrative = await proxy.generate_campus_report(concern_data)
    except Exception as e:
        logger.warning(f"AI campus report failed, using template fallback: {e}")

    # 6. If AI failed, build template narrative
    if not ai_narrative:
        top_cat = max(cat_dist, key=cat_dist.get) if cat_dist else "N/A"
        pos_count = sent_dist.get("positive", 0)
        neg_count = sent_dist.get("negative", 0)
        neutral_count = sent_dist.get("neutral", 0)
        ai_narrative = {
            "executive_summary": (
                f"This report analyzes {total} student concern(s) submitted across the campus. "
                f"Concerns span {len(cat_dist)} categor(ies), with the most frequent being "
                f"'{top_cat}'. Overall sentiment is "
                f"{'positive' if pos_count > neg_count else 'negative' if neg_count > pos_count else 'neutral'} "
                f"({pos_count} positive, {neutral_count} neutral, {neg_count} negative). "
                f"The data reveals {concern_data['total_clusters']} distinct issue cluster(s)."
            ),
            "key_findings": [
                f"{len(cat_dist)} categor(ies) of concern identified",
                f"Top category: {top_cat} with {cat_dist.get(top_cat, 0)} submission(s)",
                f"{concern_data['total_clusters']} unique issue cluster(s) detected",
                f"Sentiment is {'positive' if pos_count > neg_count else 'leaning negative' if neg_count > pos_count else 'neutral'} overall",
                f"Average priority level: {avg_priority}/5",
                f"{concern_data['unclustered_count']} concern(s) remain ungrouped",
            ],
            "trend_analysis": (
                f"Students are raising issues across {len(cat_dist)} categor(ies) with "
                f"'{top_cat}' being the most prominent. The data suggests "
                f"{'multiple areas requiring attention' if concern_data['total_clusters'] > 1 else 'a focused concern area'}."
            ),
            "suggested_actions": [
                f"Prioritize the '{top_cat}' category which received the most submissions",
                "Review top concern clusters for systemic patterns",
                "Consider targeted outreach to affected student groups",
                "Share findings with relevant departments for action planning",
            ],
        }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_concerns": total,
        "total_clusters": concern_data["total_clusters"],
        "unclustered_count": concern_data["unclustered_count"],
        "category_distribution": cat_dist,
        "sentiment_summary": sent_dist,
        "avg_priority": avg_priority,
        "date_range": concern_data["date_range"],
        "top_clusters": cluster_summaries[:8],
        "executive_summary": ai_narrative["executive_summary"],
        "key_findings": ai_narrative["key_findings"],
        "trend_analysis": ai_narrative["trend_analysis"],
        "suggested_actions": ai_narrative["suggested_actions"],
    }


# ==============================================================================
# IP CLUSTERING DATA (Feature #9)
# ==============================================================================
@router.get("/ip-clusters")
async def get_ip_clusters(
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user)
):
    """Aggregate audit log and alert IP addresses into subnet clusters."""
    from app.models.audit_log import AuditLog
    from app.models.ai_alert import AIAlert
    
    result = await db.execute(
        select(AuditLog.ip_address).where(AuditLog.ip_address.isnot(None))
    )
    audit_ips = [row[0] for row in result.all()]
    
    alert_result = await db.execute(
        select(AIAlert.ip_address).where(AIAlert.ip_address.isnot(None))
    )
    alert_ips = [row[0] for row in alert_result.all()]
    
    all_ips = audit_ips + alert_ips
    
    if not all_ips:
        return {"clusters": [], "total_unique_ips": 0}
    
    # Group by /24 subnet
    subnets = Counter()
    for ip in all_ips:
        parts = ip.split(".")
        if len(parts) == 4:
            subnet = f"{parts[0]}.{parts[1]}.{parts[2]}.x/24"
            subnets[subnet] += 1
    
    clusters = [
        {
            "subnet": subnet,
            "sessions": count,
            "flagged": count > 30,
        }
        for subnet, count in subnets.most_common(20)
    ]
    
    return {
        "clusters": clusters,
        "total_unique_ips": len(set(all_ips)),
    }


# ==============================================================================
# PENDING PHOTO REVIEW (Voter-submitted photos awaiting admin approval)
# ==============================================================================


@router.get("/pending-photos")
async def list_pending_photos(
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user),
):
    """
    List all voters who have submitted a pending photo for admin review.
    Returns both current (approved) and pending images for side-by-side comparison.
    """
    result = await db.execute(
        select(Voter).where(Voter.pending_image_url.isnot(None)).order_by(Voter.full_name)
    )
    voters = result.scalars().all()

    return [
        {
            "voter_id": str(v.voter_id),
            "full_name": v.full_name,
            "college_email": v.college_email,
            "current_image_url": v.reference_image_url or None,
            "pending_image_url": v.pending_image_url,
            "has_current_photo": v.reference_image_url is not None,
            "submitted_at": None,  # We don't have a timestamp for submission yet
        }
        for v in voters
    ]


@router.post("/pending-photos/{voter_id}/approve")
async def approve_pending_photo(
    voter_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user),
):
    """
    Approve a voter's pending photo.
    - Moves current photo to 'previous' for audit trail
    - Moves pending photo to 'current'
    - Clears pending fields
    """
    result = await db.execute(select(Voter).where(Voter.voter_id == voter_id))
    voter = result.scalars().first()
    if not voter:
        raise HTTPException(status_code=404, detail="Voter not found")

    if not voter.pending_image_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pending photo to approve.",
        )

    # Move current to previous (audit trail)
    voter.previous_image_url = voter.reference_image_url
    voter.previous_face_encoding = voter.face_encoding

    # Move pending to current and set correct model version
    voter.reference_image_url = voter.pending_image_url
    voter.face_encoding = voter.pending_face_encoding
    voter.embedding_model_version = "arcface_v1"

    # Clear pending
    voter.pending_image_url = None
    voter.pending_face_encoding = None

    # Audit log
    from app.models.audit_log import AuditLog
    from datetime import datetime, timezone

    audit_entry = AuditLog(
        event_type="PHOTO_APPROVED",
        actor_id=current_admin.get("user_id"),
        description=f"Admin approved new photo for voter {voter.full_name} ({voter.college_email})",
        created_at=datetime.now(timezone.utc),
    )
    db.add(audit_entry)

    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to approve pending photo: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while approving photo.",
        )

    return {
        "success": True,
        "message": f"Photo approved for {voter.full_name}",
        "current_image_url": voter.reference_image_url,
        "previous_image_url": voter.previous_image_url,
    }


@router.post("/pending-photos/{voter_id}/reject")
async def reject_pending_photo(
    voter_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user),
):
    """
    Reject a voter's pending photo.
    Clears the pending fields, keeping the current photo unchanged.
    """
    result = await db.execute(select(Voter).where(Voter.voter_id == voter_id))
    voter = result.scalars().first()
    if not voter:
        raise HTTPException(status_code=404, detail="Voter not found")

    if not voter.pending_image_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pending photo to reject.",
        )

    # Clear pending fields (current photo stays unchanged)
    voter.pending_image_url = None
    voter.pending_face_encoding = None

    # Audit log
    from app.models.audit_log import AuditLog
    from datetime import datetime, timezone

    audit_entry = AuditLog(
        event_type="PHOTO_REJECTED",
        actor_id=current_admin.get("user_id"),
        description=f"Admin rejected photo update for voter {voter.full_name} ({voter.college_email})",
        created_at=datetime.now(timezone.utc),
    )
    db.add(audit_entry)

    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to reject pending photo: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while rejecting photo.",
        )

    return {
        "success": True,
        "message": f"Photo update rejected for {voter.full_name}",
    }


@router.post("/pending-photos/{voter_id}/request-reupload")
@limiter.limit("30/minute")
async def request_voter_photo_reupload(
    request: Request,
    voter_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user),
):
    """
    Admin: Request a voter to re-upload their photo.
    Sets the photo_reupload_requested flag and resets reupload count to 0
    so the voter can submit a new photo.
    """
    result = await db.execute(select(Voter).where(Voter.voter_id == voter_id))
    voter = result.scalars().first()
    if not voter:
        raise HTTPException(status_code=404, detail="Voter not found")

    voter.photo_reupload_requested = True
    voter.photo_reupload_count = 0  # Reset count so they can upload again

    # Clear any pending photo
    voter.pending_image_url = None
    voter.pending_face_encoding = None

    # Audit log
    from app.models.audit_log import AuditLog
    from datetime import datetime, timezone

    audit_entry = AuditLog(
        event_type="PHOTO_REUPLOAD_REQUESTED",
        actor_id=current_admin.get("user_id"),
        description=f"Admin requested photo re-upload from voter {voter.full_name} ({voter.college_email})",
        created_at=datetime.now(timezone.utc),
    )
    db.add(audit_entry)

    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to request photo re-upload: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while requesting re-upload.",
        )

    # Send email notification
    if voter.college_email:
        admin_name = current_admin.get("email", "Election Admin")
        email_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 24px;">
            <div style="background: #6C63FF; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                <h2 style="color: white; margin: 0;">Photo Re-upload Requested</h2>
            </div>
            <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
                <p style="color: #374151; font-size: 16px;">Hi <strong>{voter.full_name}</strong>,</p>
                <p style="color: #374151; font-size: 15px; line-height: 1.5;">
                    The election admin has requested you to upload a new profile photo for your voter account.
                </p>
                <div style="background: #eef2ff; border-left: 4px solid #6C63FF; padding: 12px; margin: 20px 0; border-radius: 0 4px 4px 0;">
                    <p style="color: #4338ca; margin: 0; font-size: 14px;">
                        <strong>Action Required:</strong> Log in to your voter dashboard and upload a clear, well-lit photo of your face.
                    </p>
                </div>
                <p style="color: #6b7280; font-size: 13px; line-height: 1.4;">
                    Once submitted, the admin will review and approve your new photo. You can submit up to 2 photos for review.
                </p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                    If you have any questions, please contact the election admin.
                </p>
            </div>
        </body>
        </html>
        """
        try:
            from app.services.email_service import send_election_email
            asyncio.create_task(
                send_election_email(
                    to_email=voter.college_email,
                    recipient_name=voter.full_name,
                    subject="Photo Re-upload Requested - College Election Portal",
                    html_body=email_body
                )
            )
        except Exception as e:
            logger.error(f"Failed to send re-upload email to {voter.college_email}: {e}")

    return {
        "success": True,
        "message": f"Re-upload requested for {voter.full_name}. Email notification sent.",
    }


@router.get("/pending-photos/reupload-requests")
async def list_reupload_requests(
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user),
):
    """
    Admin: List all voters who have been asked to re-upload their photo.
    """
    result = await db.execute(
        select(Voter).where(Voter.photo_reupload_requested == True).order_by(Voter.full_name)
    )
    voters = result.scalars().all()

    return [
        {
            "voter_id": str(v.voter_id),
            "full_name": v.full_name,
            "college_email": v.college_email,
            "current_image_url": v.reference_image_url or None,
            "has_current_photo": v.reference_image_url is not None,
            "has_submitted_new_photo": v.pending_image_url is not None,
            "pending_image_url": v.pending_image_url or None,
        }
        for v in voters
    ]


@router.post("/pending-photos/{voter_id}/clear-reupload-request")
async def clear_reupload_request(
    voter_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: dict = Depends(get_admin_user),
):
    """
    Admin: Clear the re-upload request flag for a voter (e.g. after they've uploaded a new photo).
    """
    result = await db.execute(select(Voter).where(Voter.voter_id == voter_id))
    voter = result.scalars().first()
    if not voter:
        raise HTTPException(status_code=404, detail="Voter not found")

    voter.photo_reupload_requested = False

    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to clear re-upload request: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error.",
        )

    return {
        "success": True,
        "message": f"Re-upload request cleared for {voter.full_name}.",
    }
