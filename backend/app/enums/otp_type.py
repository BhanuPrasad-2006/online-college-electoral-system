import enum
from sqlalchemy import Enum as SAEnum


class OTPTypeEnum(str, enum.Enum):
    REGISTRATION     = "REGISTRATION"      # voter + contestant email OTP at signup
    VOTE_CONFIRM     = "VOTE_CONFIRM"      # voter email OTP before casting vote
    PASSWORD_RESET   = "PASSWORD_RESET"    # email OTP for forgot password
    CANDIDATE_MOBILE = "CANDIDATE_MOBILE"  # contestant mobile OTP during registration


OTPType = SAEnum(OTPTypeEnum, name="otp_type", create_type=False)