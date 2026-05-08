import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class OTPRequest(Base):
    __tablename__ = "otp_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("voters.id"), nullable=False)
    otp_hash = Column(String(255), nullable=False)
    purpose = Column(String(50), nullable=False)  # login, password_reset, vote_verification
    is_used = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
