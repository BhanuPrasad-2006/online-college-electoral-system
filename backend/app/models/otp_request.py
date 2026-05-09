from sqlalchemy import Column, String, Boolean, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.db.base import Base
from app.enums.otp_type import OTPType


class OTPRequest(Base):
    __tablename__ = "otp_requests"

    otp_id     = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipient  = Column(String(150), nullable=False)  # email address OR mobile number
    otp_type   = Column(OTPType, nullable=False)
    otp_hash   = Column(String(64), nullable=False)   # SHA-256 of OTP — never plaintext
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    is_used    = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP(timezone=True))

    # OTP types used in this project:
    # REGISTRATION     → voter + contestant email OTP at signup
    # VOTE_CONFIRM     → voter email OTP before casting vote
    # PASSWORD_RESET   → email OTP for forgot password
    # CANDIDATE_MOBILE → contestant mobile OTP during application