import enum


class CandidateStatusEnum(str, enum.Enum):
    PENDING      = "PENDING"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED     = "APPROVED"
    REJECTED     = "REJECTED"