import enum
from sqlalchemy import Enum as SAEnum


class ElectionStatusEnum(str, enum.Enum):
    UPCOMING          = "UPCOMING"
    REGISTRATION_OPEN = "REGISTRATION_OPEN"
    VOTING_OPEN       = "VOTING_OPEN"
    CLOSED            = "CLOSED"
    RESULTS_PUBLISHED = "RESULTS_PUBLISHED"


ElectionStatus = SAEnum(ElectionStatusEnum, name="election_status", create_type=False)