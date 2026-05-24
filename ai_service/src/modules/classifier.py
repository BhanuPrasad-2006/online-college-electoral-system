"""Concern classifier — categorizes student concerns using embedding-based NLP."""

import logging
from src.utils.embeddings import EmbeddingService

logger = logging.getLogger(__name__)


class ConcernClassifier:
    """Classifies student concerns into categories using embedding similarity.
    Falls back to keyword matching if the embedding model is unavailable.
    """

    CATEGORIES = ["academic", "infrastructure", "campus_life", "administration", "other"]

    # Canonical category descriptions used as reference embeddings
    CATEGORY_DESCRIPTIONS = {
        "academic": (
            "Issues related to courses, curriculum, exams, grading, professors, "
            "labs, library resources, research opportunities, and academic scheduling."
        ),
        "infrastructure": (
            "Issues related to campus buildings, wifi and internet connectivity, "
            "water supply, electricity, AC, parking, roads, canteen food quality, and maintenance."
        ),
        "campus_life": (
            "Issues related to events, clubs, sports, cultural festivals, hostel life, "
            "mess food, recreation, student activities, and social life on campus."
        ),
        "administration": (
            "Issues related to fee structure, admissions process, ID cards, certificates, "
            "office staff behavior, transparency, policy decisions, and bureaucratic processes."
        ),
    }

    def __init__(self):
        self.model = None
        self.embeddings = EmbeddingService()
        self._category_vectors = {}
        self._init_category_vectors()

    def _init_category_vectors(self):
        """Pre-compute embedding vectors for each category description."""
        for cat, desc in self.CATEGORY_DESCRIPTIONS.items():
            vec = self.embeddings.embed(desc)
            self._category_vectors[cat] = vec

    def classify(self, text: str) -> str:
        """Classify concern text into a category using embedding similarity.
        Falls back to keyword matching if embeddings are not available.
        """
        if not text or not text.strip():
            return "other"

        # Try embedding-based classification first
        if self.embeddings.model is not None:
            try:
                text_vec = self.embeddings.embed(text)
                best_cat = "other"
                best_score = -1.0

                for cat, cat_vec in self._category_vectors.items():
                    score = self.embeddings.similarity(text_vec, cat_vec)
                    if score > best_score:
                        best_score = score
                        best_cat = cat

                # Only use embedding result if similarity is meaningful
                if best_score > 0.3:
                    logger.debug(f"Embedding classify: '{text[:40]}...' -> {best_cat} ({best_score:.3f})")
                    return best_cat
                else:
                    logger.debug(f"Embedding score too low ({best_score:.3f}), falling back to keywords")
            except Exception as e:
                logger.warning(f"Embedding classification failed: {e}")

        # Fallback: keyword-based matching
        text_lower = text.lower()
        keyword_map = {
            "academic": [
                "library", "course", "exam", "lab", "professor", "class", "grade",
                "syllabus", "curriculum", "assignment", "lecture", "study", "book",
                "research", "thesis", "seminar", "workshop", "tutorial", "gpa",
            ],
            "infrastructure": [
                "building", "water", "wifi", "internet", "ac", "road", "parking",
                "canteen", "electricity", "power", "fan", "light", "bench", "table",
                "classroom", "projector", "computer", "printer", "network",
            ],
            "campus_life": [
                "event", "club", "sports", "cultural", "fest", "hostel", "food",
                "recreation", "gym", "ground", "auditorium", "celebration", "music",
                "dance", "competition", "tournament", "mess", "cafeteria",
            ],
            "administration": [
                "fee", "admission", "id card", "certificate", "transparency", "office",
                "scholarship", "application", "registration", "document", "approval",
                "stipend", "refund", "notice", "circular", "complaint", "grievance",
            ],
        }

        # Score each category by keyword density
        scores = {}
        for category, keywords in keyword_map.items():
            score = sum(1 for kw in keywords if kw in text_lower)
            if score > 0:
                scores[category] = score

        if scores:
            return max(scores, key=scores.get)

        return "other"

    def classify_batch(self, texts: list) -> list:
        """Classify a batch of texts."""
        return [self.classify(t) for t in texts]
