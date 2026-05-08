"""Concern validation — ensures content is appropriate and category is valid."""

from app.core.constants import CONCERN_CATEGORIES


def validate_concern(title: str, description: str, category: str) -> tuple[bool, str]:
    """Validate concern submission."""
    if len(title) < 5:
        return False, "Title must be at least 5 characters"
    if len(description) < 20:
        return False, "Description must be at least 20 characters"
    if category not in CONCERN_CATEGORIES:
        return False, f"Invalid category. Must be one of: {', '.join(CONCERN_CATEGORIES)}"
    return True, ""
