import enum
from sqlalchemy import Enum as SAEnum


class CandidateStatusEnum(str, enum.Enum):
    PENDING      = "PENDING"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED     = "APPROVED"
    REJECTED     = "REJECTED"


CandidateStatus = SAEnum(CandidateStatusEnum, name="candidate_status", create_type=False)