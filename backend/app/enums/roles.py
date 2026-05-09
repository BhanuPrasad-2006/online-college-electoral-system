from enum import Enum


class UserRole(str, Enum):
    STUDENT = "STUDENT"
    CANDIDATE = "CANDIDATE"
    ADMIN = "ADMIN"