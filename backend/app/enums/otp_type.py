import enum


class OTPTypeEnum(str, enum.Enum):
    EMAIL            = "EMAIL"
    SMS              = "SMS"
    REGISTRATION     = "REGISTRATION"
    VOTE_CONFIRM     = "VOTE_CONFIRM"
    PASSWORD_RESET   = "PASSWORD_RESET"
    CANDIDATE_MOBILE = "CANDIDATE_MOBILE"