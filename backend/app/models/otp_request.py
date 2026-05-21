import uuid

from sqlalchemy import (
    Column,
    String,
    Boolean,
    DateTime,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import PgEnum
from app.enums.otp_type import OTPTypeEnum


class OTPRequest(Base):
    __tablename__ = "otp_requests"

    otp_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    recipient = Column(String(255), nullable=False)

    otp_type = Column(
        PgEnum(OTPTypeEnum, pg_type_name="otp_type"),
        nullable=False
    )

    otp_hash = Column(String(255), nullable=False)

    expires_at = Column(DateTime(timezone=True), nullable=False)

    is_used = Column(Boolean, default=False)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )
