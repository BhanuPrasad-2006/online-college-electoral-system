import uuid
from sqlalchemy import Column, String, ForeignKey, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db.base import Base

class CampaignMedia(Base):
    __tablename__ = "campaign_media"

    # =========================================================
    # PRIMARY KEY
    # =========================================================
    media_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # =========================================================
    # FOREIGN KEYS
    # =========================================================
    candidate_id = Column(
        UUID(as_uuid=True),
        ForeignKey("candidates.candidate_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    reviewed_by = Column(
        UUID(as_uuid=True),
        ForeignKey("admin_users.admin_id", ondelete="SET NULL"),
        nullable=True,
    )

    # =========================================================
    # MEDIA CONTENT
    # =========================================================
    type = Column(
        String(50),
        nullable=False,  # "video", "poster", "message"
    )

    title = Column(
        String(255),
        nullable=False,
    )

    uploaded_file_url = Column(
        String(500),
        nullable=True,
    )

    external_url = Column(
        String(500),
        nullable=True,
    )

    body = Column(
        Text,
        nullable=True,
    )

    status = Column(
        String(50),
        default="PENDING",
        nullable=False,  # "PENDING", "APPROVED", "REJECTED"
    )

    # =========================================================
    # TIMESTAMPS
    # =========================================================
    submitted_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    reviewed_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    rejection_reason = Column(
        String(500),
        nullable=True,
    )

    # =========================================================
    # RELATIONSHIPS
    # =========================================================
    candidate = relationship("Candidate")
    reviewer = relationship("AdminUser")

    def __repr__(self):
        return f"<CampaignMedia id={self.media_id} candidate_id={self.candidate_id} status={self.status}>"
