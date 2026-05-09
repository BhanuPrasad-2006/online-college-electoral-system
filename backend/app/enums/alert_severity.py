import enum
from sqlalchemy import Enum as SAEnum


class AlertSeverityEnum(str, enum.Enum):
    LOW      = "LOW"
    MEDIUM   = "MEDIUM"
    HIGH     = "HIGH"
    CRITICAL = "CRITICAL"


AlertSeverity = SAEnum(AlertSeverityEnum, name="alert_severity", create_type=False)