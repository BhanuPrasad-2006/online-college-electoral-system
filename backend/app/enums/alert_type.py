import enum
from sqlalchemy import Enum as SAEnum


class AlertTypeEnum(str, enum.Enum):
    VELOCITY_ANOMALY = "VELOCITY_ANOMALY"
    IP_CLUSTERING    = "IP_CLUSTERING"
    BEHAVIORAL       = "BEHAVIORAL"
    PREDICTION       = "PREDICTION"


AlertType = SAEnum(AlertTypeEnum, name="alert_type", create_type=False)