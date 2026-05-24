"""College API service — validates student enrollment with college systems."""

import re

from app.utils.logger import logger


class CollegeAPIService:
    """
    Service for validating student enrollment with college systems.
    
    In production, this should integrate with the actual college enrollment
    API/DB. The current implementation uses configurable validation rules
    and returns hardcoded departments.
    """

    # Configurable validation patterns
    ROLL_NUMBER_PATTERN = re.compile(r"^[A-Za-z0-9]{6,15}$")
    EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(ac\.in|edu|org|com)$")

    # Known valid roll numbers (for development/testing)
    KNOWN_ROLL_NUMBERS: set = {
        "22CS001", "22CS002", "22CS003", "22EC001", "22EC002",
        "22ME001", "22ME002", "22CV001", "22EE001", "22EE002",
    }

    async def verify_student(self, roll_number: str, email: str) -> bool:
        """
        Verify student enrollment with college database.
        
        Validates roll number format, email domain, and checks against
        known student records. Returns True if student is verified.
        """
        if not roll_number or not email:
            logger.warning("College API: Empty roll_number or email provided")
            return False

        if not self.ROLL_NUMBER_PATTERN.match(roll_number):
            logger.warning(f"College API: Invalid roll number format: {roll_number}")
            return False

        if not self.EMAIL_PATTERN.match(email):
            logger.warning(f"College API: Invalid email format: {email}")
            return False

        # Check if roll number is recognized
        roll_upper = roll_number.upper()
        if roll_upper in self.KNOWN_ROLL_NUMBERS:
            logger.info(f"College API: Student verified (known roll): {roll_upper} <{email}>")
            return True

        # In production, call external college API here
        # For now, accept valid-format credentials with logging
        logger.info(f"College API: Student passed format validation: {roll_upper} <{email}>")
        return True

    async def get_departments(self) -> list:
        """Get list of departments from college."""
        return [
            "Computer Science",
            "Electronics",
            "Mechanical",
            "Civil",
            "Electrical",
            "Information Technology",
            "Artificial Intelligence & ML",
        ]
