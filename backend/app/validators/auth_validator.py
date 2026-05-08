"""Auth validation — email format, password strength, roll number format."""

import re


def validate_password(password: str) -> tuple[bool, str]:
    """Validate password strength."""
    if len(password) < 8:
        return False, "Password must be at least 8 characters"
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r'\d', password):
        return False, "Password must contain at least one digit"
    return True, ""


def validate_roll_number(roll_number: str) -> bool:
    """Validate roll number format."""
    pattern = r'^[0-9]{2}[A-Z]{2,4}[0-9]{3}$'
    return bool(re.match(pattern, roll_number))
