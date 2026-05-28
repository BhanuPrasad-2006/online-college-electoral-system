import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base

class AdminMeeting(Base):
    __tablename__ = "admin_meetings"

    meeting_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    title = Column(String(255), nullable=False)
    agenda = Column(Text, nullable=False)
    meeting_time = Column(DateTime(timezone=True), nullable=False)
    jitsi_link = Column(String(500), nullable=False)
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("admin_users.admin_id"),
        nullable=False,
    )
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    creator = relationship("AdminUser", foreign_keys=[created_by])
    participants = relationship(
        "MeetingParticipant",
        back_populates="meeting",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<AdminMeeting title={self.title} time={self.meeting_time}>"
