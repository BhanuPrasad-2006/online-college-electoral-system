import uuid
from sqlalchemy import Column, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.base import Base

class MeetingParticipant(Base):
    __tablename__ = "meeting_participants"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    meeting_id = Column(
        UUID(as_uuid=True),
        ForeignKey("admin_meetings.meeting_id", ondelete="CASCADE"),
        nullable=False,
    )
    admin_id = Column(
        UUID(as_uuid=True),
        ForeignKey("admin_users.admin_id", ondelete="CASCADE"),
        nullable=False,
    )
    attended = Column(Boolean, nullable=False, default=False)

    # Relationships
    meeting = relationship("AdminMeeting", back_populates="participants")
    admin = relationship("AdminUser", foreign_keys=[admin_id])

    def __repr__(self):
        return f"<MeetingParticipant meeting={self.meeting_id} admin={self.admin_id} attended={self.attended}>"
