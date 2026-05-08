"""Concern service — handles concern CRUD with AI classification."""

from sqlalchemy.orm import Session


class ConcernService:
    def __init__(self, db: Session):
        self.db = db

    async def create(self, user_id: str, title: str, description: str, category: str):
        """Create a new concern with AI classification."""
        # TODO: Validate concern
        # TODO: Call AI service for classification/sentiment
        # TODO: Store concern
        pass

    async def list_concerns(self, page: int = 1, page_size: int = 20):
        """List concerns with pagination."""
        # TODO: Query with pagination
        pass

    async def upvote(self, concern_id: str, user_id: str):
        """Upvote a concern."""
        # TODO: Check if already upvoted
        # TODO: Increment count
        pass

    async def get_report(self):
        """Get aggregated concern report by category."""
        # TODO: Aggregate by category with sentiment
        pass
