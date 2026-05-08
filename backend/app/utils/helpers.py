"""General helper utilities."""

from datetime import datetime


def utcnow() -> datetime:
    """Get current UTC datetime."""
    return datetime.utcnow()


def paginate(query, page: int, page_size: int):
    """Apply pagination to a SQLAlchemy query."""
    offset = (page - 1) * page_size
    return query.offset(offset).limit(page_size)
