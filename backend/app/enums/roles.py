import enum


class UserRoleEnum(str, enum.Enum):
    VOTER     = "voter"
    CANDIDATE = "candidate"
    ADMIN     = "admin"