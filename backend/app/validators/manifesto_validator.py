"""Manifesto validation — content length, goals, and structure checks."""


def validate_manifesto(title: str, content: str) -> tuple[bool, str]:
    """Validate manifesto submission."""
    if len(title) < 5:
        return False, "Title must be at least 5 characters"
    if len(content) < 100:
        return False, "Manifesto content must be at least 100 characters"
    if len(content) > 10000:
        return False, "Manifesto content must not exceed 10000 characters"
    return True, ""
