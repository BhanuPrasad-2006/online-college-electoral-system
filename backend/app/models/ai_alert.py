import uuid

from sqlalchemy import Column, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import PgEnum
from app.enums.alert_type import AlertTypeEnum
from app.enums.alert_severity import AlertSeverityEnum


class AIAlert(Base):
    __tablename__ = "ai_alerts"

    # ── Exact DB columns ─────────────────────────────────────
    alert_id    = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    election_id = Column(String(36), ForeignKey("elections.election_id"), nullable=True, index=True)
    alert_type  = Column(PgEnum(AlertTypeEnum, pg_type_name="alert_type"), nullable=False)
    severity    = Column(
        PgEnum(AlertSeverityEnum, pg_type_name="alert_severity"),
        nullable=False,
        default=AlertSeverityEnum.MEDIUM.value,
    )
    description = Column(Text, nullable=False)
    ip_address  = Column(String(45), nullable=True)
    is_resolved = Column(Boolean, default=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    # ── Relationships ─────────────────────────────────────────
    election = relationship("Election", back_populates="ai_alerts")

    def __repr__(self):
        return f"<AIAlert {self.alert_type} [{self.severity}] resolved={self.is_resolved}>"
