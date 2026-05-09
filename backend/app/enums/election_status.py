from enum import Enum


class ElectionStatus(str, Enum):
    UPCOMING = "UPCOMING"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"
    RESULT_PUBLISHED = "RESULT_PUBLISHED"