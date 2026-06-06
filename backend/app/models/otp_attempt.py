import uuid

from sqlalchemy import Column, String, Boolean, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db.base import Base


class OTPAttempt(Base):
    __tablename__ = "otp_attempts"

    attempt_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    recipient = Column(
        String(255),
        nullable=False,
        index=True,
    )

    ip_address = Column(
        String(45),
        nullable=True,
    )

    attempt_type = Column(
        String(20),
        nullable=False,
        index=True,
    )

    success = Column(
        Boolean,
        default=False,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
    )

    def __repr__(self):
        return f"<OTPAttempt {self.recipient} type={self.attempt_type} success={self.success}>"
