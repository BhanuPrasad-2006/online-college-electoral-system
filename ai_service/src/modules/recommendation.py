"""Recommendation engine — matches candidates to student concerns using semantic similarity."""

import logging
from src.utils.embeddings import EmbeddingService

logger = logging.getLogger(__name__)


class RecommendationEngine:
    """Matches students' concerns to candidates by semantic similarity.
    Uses embedding vectors to compare concern text with candidate manifesto content.
    """

    def __init__(self):
        self.embeddings = EmbeddingService()

    def recommend(self, concerns: list, candidates: list = None) -> list:
        """Generate candidate recommendations based on concerns.
        
        Args:
            concerns: List of concern text strings from the student.
            candidates: Optional list of candidate dicts with 'id', 'name', 'manifesto'.
                        If None, uses placeholder candidates for demo.
            
        Returns:
            List of dicts with candidate_id, match_score, matching_themes, explanation.
        """
        if not concerns:
            return []

        # Use provided candidates or fallback to placeholders
        if not candidates:
            candidates = [
                {"id": "candidate-1", "name": "Arjun Sharma", "manifesto": "Focus on digital classrooms, campus wifi upgrades, and new library facilities."},
                {"id": "candidate-2", "name": "Priya Patel", "manifesto": "Improve hostel amenities, increase sports funding, and introduce skill workshops."},
                {"id": "candidate-3", "name": "Kiran Reddy", "manifesto": "Transparent administration, fee reduction, and better exam scheduling."},
            ]

        # Compute embeddings for all concerns (averaged)
        try:
            concern_embeddings = self.embeddings.embed_batch(concerns)
            # Average all concern embeddings to get the student's overall concern vector
            if concern_embeddings:
                avg_concern_vec = [sum(vals) / len(vals) for vals in zip(*concern_embeddings)]
            else:
                return []
        except Exception as e:
            logger.error(f"Failed to embed concerns: {e}")
            return []

        # Compute embeddings for each candidate's manifesto
        manifesto_texts = [c.get("manifesto", "") for c in candidates]
        try:
            manifesto_embeddings = self.embeddings.embed_batch(manifesto_texts)
        except Exception as e:
            logger.error(f"Failed to embed manifestos: {e}")
            return []

        # Compute similarity scores
        recommendations = []
        for i, candidate in enumerate(candidates):
            if i >= len(manifesto_embeddings):
                continue

            manifesto_emb = manifesto_embeddings[i]
            score = self.embeddings.similarity(avg_concern_vec, manifesto_emb)

            # Extract matching themes by comparing each concern individually
            matching_themes = self._extract_matching_themes(
                concerns, candidate, concern_embeddings, manifesto_emb
            )

            explanation = self._generate_explanation(
                candidate.get("name", "Candidate"), score, matching_themes
            )

            recommendations.append({
                "candidate_id": candidate.get("id", f"candidate-{i+1}"),
                "match_score": round(score, 3),
                "matching_themes": matching_themes,
                "explanation": explanation,
            })

        # Sort by match score descending
        recommendations.sort(key=lambda r: r["match_score"], reverse=True)
        return recommendations

    def _extract_matching_themes(
        self,
        concerns: list,
        candidate: dict,
        concern_embeddings: list,
        manifesto_embedding: list,
    ) -> list:
        """Extract themes from concerns that best match the candidate's manifesto."""
        matching_themes = []

        for i, concern in enumerate(concerns):
            if i >= len(concern_embeddings):
                continue
            score = self.embeddings.similarity(concern_embeddings[i], manifesto_embedding)
            if score > 0.35:  # Threshold for meaningful match
                # Extract a short theme from the concern
                theme = concern.strip()
                if len(theme) > 60:
                    theme = theme[:57] + "..."
                matching_themes.append(theme)

        return matching_themes[:5]  # Limit to top 5 themes

    def _generate_explanation(self, name: str, score: float, themes: list) -> str:
        """Generate a human-readable explanation of the recommendation."""
        if score > 0.7:
            strength = "strongly aligns"
        elif score > 0.5:
            strength = "moderately aligns"
        elif score > 0.3:
            strength = "somewhat aligns"
        else:
            strength = "weakly aligns"

        theme_part = ""
        if themes:
            theme_part = f" Key matching areas: {'; '.join(themes[:3])}."

        return f"{name} {strength} with your concerns (match score: {score:.2f}).{theme_part}"
