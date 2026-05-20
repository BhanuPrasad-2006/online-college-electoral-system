import enum


class ElectionStatusEnum(str, enum.Enum):
    UPCOMING          = "UPCOMING"
    REGISTRATION_OPEN = "REGISTRATION_OPEN"
    VOTING_OPEN       = "VOTING_OPEN"
    CLOSED            = "CLOSED"
    RESULTS_PUBLISHED = "RESULTS_PUBLISHED"