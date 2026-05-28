import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base

class Notice(Base):
    __tablename__ = "notices"

    notice_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    priority = Column(String(50), nullable=False, default="LOW")
    pdf_url = Column(String(500), nullable=True)
    qr_code = Column(String(255), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("admin_users.admin_id"),
        nullable=False,
    )

    # Relationships
    creator = relationship("AdminUser", foreign_keys=[created_by])

    def __repr__(self):
        return f"<Notice title={self.title} priority={self.priority}>"
