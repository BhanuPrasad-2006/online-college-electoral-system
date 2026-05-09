from sqlalchemy import Column, String, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID, INET
import uuid
from app.db.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    log_id      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type  = Column(String(80), nullable=False)  # LOGIN, VOTE_CAST, CANDIDATE_APPROVED ...
    actor_id    = Column(UUID(as_uuid=True))           # nullable — anonymous events have no actor
    ip_address  = Column(INET)
    description = Column(Text)
    created_at  = Column(TIMESTAMP(timezone=True))

    # No relationships — audit logs are write-only, never joined back
    # Common event_type values:
    # LOGIN_SUCCESS, LOGIN_FAILED, OTP_SENT, OTP_VERIFIED
    # VOTE_CAST, CANDIDATE_APPLIED, CANDIDATE_APPROVED, CANDIDATE_REJECTED
    # ELECTION_CREATED, RESULTS_PUBLISHED, ADMIN_ACTION