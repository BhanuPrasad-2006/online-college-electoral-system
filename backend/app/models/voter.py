import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class Voter(Base):
    __tablename__ = "voters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    roll_number = Column(String(50), unique=True, nullable=False, index=True)
    department = Column(String(100), nullable=False)
    year = Column(Integer, nullable=False)
    role = Column(String(20), default="student", nullable=False)
    avatar_url = Column(String(500), nullable=True)
    is_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    totp_secret = Column(String(255), nullable=True)
    webauthn_credential = Column(String(1000), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
