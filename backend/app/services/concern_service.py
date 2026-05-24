"""Concern service — handles concern CRUD with AI classification."""

import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.concern import Concern
from app.models.election import Election
from app.enums.concern_enums import ConcernCategoryEnum, SentimentEnum
from app.utils.logger import logger

CATEGORY_LABELS: dict[ConcernCategoryEnum, str] = {
    ConcernCategoryEnum.ACADEMIC: "Academics & Placements",
    ConcernCategoryEnum.INFRASTRUCTURE: "Wi-Fi & Infrastructure",
    ConcernCategoryEnum.CAMPUS_LIFE: "Campus Life & Events",
    ConcernCategoryEnum.ADMINISTRATION: "Administration",
    ConcernCategoryEnum.OTHER: "Other",
}

COVERAGE_KEYWORDS: dict[ConcernCategoryEnum, list[str]] = {
    ConcernCategoryEnum.ACADEMIC: [
        "academic", "placement", "career", "internship", "course", "exam", "faculty", "training",
    ],
    ConcernCategoryEnum.INFRASTRUCTURE: [
        "wifi", "wi-fi", "infrastructure", "internet", "network", "lab", "building", "fiber",
    ],
    ConcernCategoryEnum.CAMPUS_LIFE: [
        "hostel", "cafeteria", "sports", "event", "culture", "club", "mental", "health", "welfare",
    ],
    ConcernCategoryEnum.ADMINISTRATION: [
        "admin", "governance", "policy", "fee", "schedule", "transport", "bus",
    ],
    ConcernCategoryEnum.OTHER: ["student", "campus", "college"],
}


class ConcernService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        user_id: str,
        title: str,
        description: str,
        category: str = "other",
        candidate_id: Optional[str] = None,
        attachment_url: Optional[str] = None,
    ) -> dict:
        """Create a new concern with AI classification."""
        # Get current election for election_id
        election_result = await self.db.execute(
            select(Election).order_by(Election.created_at.desc())
        )
        election = election_result.scalars().first()
        election_id = str(election.election_id) if election else None

        # Map category string to enum
        category_enum = None
        try:
            category_enum = ConcernCategoryEnum(category.lower())
        except (ValueError, AttributeError):
            category_enum = ConcernCategoryEnum.OTHER

        concern = Concern(
            concern_id=str(uuid.uuid4()),
            student_id=user_id,
            election_id=election_id,
            content=f"{title}\n\n{description}",
            category=category_enum,
            priority=2,
            attachment_url=attachment_url,
            submitted_at=datetime.now(timezone.utc),
        )
        self.db.add(concern)
        await self.db.commit()
        await self.db.refresh(concern)

        logger.info(f"Concern created: {concern.concern_id} by student {user_id} in category '{category}'")
        return {
            "concern_id": concern.concern_id,
            "content": concern.content,
            "category": concern.category.value if concern.category else "other",
            "submitted_at": concern.submitted_at.isoformat() if concern.submitted_at else None,
        }

    async def list_concerns(
        self,
        page: int = 1,
        page_size: int = 20,
        election_id: Optional[str] = None,
    ) -> dict:
        """List concerns with pagination."""
        query = select(Concern).order_by(desc(Concern.submitted_at))

        if election_id:
            query = query.where(Concern.election_id == election_id)

        # Get total count
        count_query = select(func.count()).select_from(Concern)
        if election_id:
            count_query = count_query.where(Concern.election_id == election_id)
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await self.db.execute(query)
        concerns = result.scalars().all()

        return {
            "concerns": [
                {
                    "concern_id": c.concern_id,
                    "content": c.content,
                    "category": c.category.value if c.category else "other",
                    "priority": c.priority,
                    "submitted_at": c.submitted_at.isoformat() if c.submitted_at else None,
                }
                for c in concerns
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    async def upvote(self, concern_id: str, user_id: str) -> dict:
        """Upvote a concern (increment priority)."""
        result = await self.db.execute(
            select(Concern).where(Concern.concern_id == concern_id)
        )
        concern = result.scalar_one_or_none()
        if not concern:
            raise ValueError(f"Concern {concern_id} not found")

        concern.priority = (concern.priority or 0) + 1
        await self.db.commit()
        await self.db.refresh(concern)

        logger.info(f"Concern {concern_id} upvoted (priority: {concern.priority})")
        return {
            "concern_id": concern.concern_id,
            "priority": concern.priority,
        }

    def _category_label(self, category: Optional[ConcernCategoryEnum]) -> str:
        if category and category in CATEGORY_LABELS:
            return CATEGORY_LABELS[category]
        return "Other"

    def _manifesto_covers_category(self, manifesto_text: str, category: Optional[ConcernCategoryEnum]) -> bool:
        if not manifesto_text or not category:
            return False
        lowered = manifesto_text.lower()
        keywords = COVERAGE_KEYWORDS.get(category, COVERAGE_KEYWORDS[ConcernCategoryEnum.OTHER])
        return any(kw in lowered for kw in keywords)

    async def get_report(self, manifesto_text: Optional[str] = None) -> list:
        """Get aggregated concern report by category with sentiment breakdown."""
        query = select(Concern.category, Concern.sentiment, func.count(Concern.concern_id)).group_by(
            Concern.category, Concern.sentiment
        )
        result = await self.db.execute(query)
        rows = result.all()

        by_category: dict[Optional[ConcernCategoryEnum], dict] = {}
        for category, sentiment, count in rows:
            if category not in by_category:
                by_category[category] = {
                    "mentions": 0,
                    "positive": 0,
                    "neutral": 0,
                    "negative": 0,
                }
            bucket = by_category[category]
            bucket["mentions"] += count
            if sentiment == SentimentEnum.POSITIVE:
                bucket["positive"] += count
            elif sentiment == SentimentEnum.NEGATIVE:
                bucket["negative"] += count
            else:
                bucket["neutral"] += count

        report = []
        for category, stats in by_category.items():
            total = stats["mentions"] or 1
            report.append({
                "name": self._category_label(category),
                "mentions": stats["mentions"],
                "positive": round(100 * stats["positive"] / total),
                "neutral": round(100 * stats["neutral"] / total),
                "negative": round(100 * stats["negative"] / total),
                "covered": self._manifesto_covers_category(manifesto_text or "", category),
            })

        report.sort(key=lambda x: x["mentions"], reverse=True)
        return report

    @staticmethod
    def compute_overall_sentiment(categories: list) -> dict:
        """Weighted overall positive/neutral/negative percentages."""
        if not categories:
            return {"positive": 0, "neutral": 0, "negative": 0}
        total_mentions = sum(c.get("mentions", 0) for c in categories) or 1
        positive = sum(c.get("positive", 0) * c.get("mentions", 0) for c in categories) / total_mentions
        neutral = sum(c.get("neutral", 0) * c.get("mentions", 0) for c in categories) / total_mentions
        negative = sum(c.get("negative", 0) * c.get("mentions", 0) for c in categories) / total_mentions
        return {
            "positive": round(positive),
            "neutral": round(neutral),
            "negative": round(negative),
        }
