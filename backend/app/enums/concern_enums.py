import enum


class ConcernCategoryEnum(str, enum.Enum):
    """Python-side validation only. DB column is TEXT, not a native PG enum."""
    ACADEMIC       = "academic"
    INFRASTRUCTURE = "infrastructure"
    CAMPUS_LIFE    = "campus_life"
    ADMINISTRATION = "administration"
    OTHER          = "other"


class SentimentEnum(str, enum.Enum):
    """Python-side validation only. DB column is TEXT, not a native PG enum."""
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL  = "neutral"
    MIXED    = "mixed"
