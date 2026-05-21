import enum


class AlertTypeEnum(str, enum.Enum):
    VELOCITY_ANOMALY = "VELOCITY_ANOMALY"
    IP_CLUSTERING    = "IP_CLUSTERING"
    BEHAVIORAL       = "BEHAVIORAL"
    PREDICTION       = "PREDICTION"