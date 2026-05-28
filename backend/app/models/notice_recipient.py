import uuid
from sqlalchemy import Column, ForeignKey, Boolean, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.base import Base

class NoticeRecipient(Base):
    __tablename__ = "notice_recipients"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    notice_id = Column(
        UUID(as_uuid=True),
        ForeignKey("notices.notice_id", ondelete="CASCADE"),
        nullable=False,
    )
    recipient_voter_id = Column(
        UUID(as_uuid=True),
        ForeignKey("voters.voter_id", ondelete="CASCADE"),
        nullable=True,
    )
    role_target = Column(String(50), nullable=False, default="ALL")
    is_read = Column(Boolean, nullable=False, default=False)

    # Relationships
    notice = relationship("Notice", foreign_keys=[notice_id])
    voter = relationship("Voter", foreign_keys=[recipient_voter_id])

    def __repr__(self):
        return f"<NoticeRecipient notice={self.notice_id} voter={self.recipient_voter_id} target={self.role_target}>"
