from sqlalchemy import Column, Text, Boolean, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, INET
from sqlalchemy.orm import relationship
import uuid
from app.db.base import Base
from app.enums.alert_type import AlertType
from app.enums.alert_severity import AlertSeverity


class AIAlert(Base):
    __tablename__ = "ai_alerts"

    alert_id    = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    election_id = Column(UUID(as_uuid=True), ForeignKey("elections.election_id"))
    alert_type  = Column(AlertType, nullable=False)
    severity    = Column(AlertSeverity, nullable=False)
    description = Column(Text)
    ip_address  = Column(INET)
    is_resolved = Column(Boolean, default=False)
    created_at  = Column(TIMESTAMP(timezone=True))

    # relationships
    election = relationship("Election", back_populates="ai_alerts")