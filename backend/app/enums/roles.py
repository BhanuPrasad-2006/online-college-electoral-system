import enum
from sqlalchemy import Enum as SAEnum


class UserRoleEnum(str, enum.Enum):
    voter     = "voter"
    candidate = "candidate"
    admin     = "admin"


UserRole = SAEnum(UserRoleEnum, name="user_role", create_type=False)