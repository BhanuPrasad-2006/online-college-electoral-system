"""Announcements routes - admin broadcast announcements with optional email dispatch."""

import uuid
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel

from app.db.session import get_db
from app.api.deps import get_admin_user
from app.models.announcement import Announcement
from app.models.voter import Voter
from app.services.email_service import send_election_email
from app.utils.logger import logger

router = APIRouter()


class AnnouncementCreateRequest(BaseModel):
    """Request model for creating an announcement."""
    title: str
    body: str
    recipients: str = "All Users"


@router.get("/", status_code=status.HTTP_200_OK)
async def list_announcements(
    admin: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 20,
):
    """List all announcements, most recent first."""
    result = await db.execute(
        select(Announcement).order_by(desc(Announcement.created_at)).limit(limit)
    )
    return result.scalars().all()


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_announcement(
    body: AnnouncementCreateRequest,
    admin: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new announcement and dispatch via email.

    Admins are ALWAYS allowed to send announcements — there is no phase restriction.
    """
    announcement = Announcement(
        announcement_id=str(uuid.uuid4()),
        title=body.title,
        body=body.body,
        recipients=body.recipients,
        sent_by=admin.get("email", "admin"),
        is_published=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(announcement)
    await db.commit()
    await db.refresh(announcement)
    asyncio.create_task(_dispatch_emails(announcement))
    return {"message": "Announcement created and dispatched.", "announcement": announcement}


@router.get("/{announcement_id}", status_code=status.HTTP_200_OK)
async def get_announcement(
    announcement_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single announcement by ID."""
    result = await db.execute(
        select(Announcement).where(Announcement.announcement_id == announcement_id)
    )
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return a


@router.delete("/{announcement_id}", status_code=status.HTTP_200_OK)
async def delete_announcement(
    announcement_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an announcement by ID."""
    result = await db.execute(
        select(Announcement).where(Announcement.announcement_id == announcement_id)
    )
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Announcement not found")
    await db.delete(a)
    await db.commit()
    return {"message": "Announcement deleted."}


async def _dispatch_emails(announcement: Announcement):
    """Send announcement emails to all voters in the background."""
    try:
        from app.db.session import SessionLocal
        async with SessionLocal() as db:
            voters = (await db.execute(select(Voter))).scalars().all()
            for v in voters:
                if not v.college_email:
                    continue
                html = f"<html><body><h3>{announcement.title}</h3><p>{announcement.body}</p></body></html>"
                await send_election_email(
                    to_email=v.college_email,
                    recipient_name=v.full_name,
                    subject=announcement.title,
                    html_body=html,
                )
    except Exception as e:
        logger.error(f"Error dispatching announcement: {e}")