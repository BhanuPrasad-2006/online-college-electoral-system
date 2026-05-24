"""Clustering module — groups similar concerns using TF-IDF + cosine similarity."""

import logging
import numpy as np

logger = logging.getLogger(__name__)


class ConcernClusterer:
    """Clusters similar student concerns together using TF-IDF vectorization
    and cosine similarity with hierarchical clustering.
    Falls back to simple keyword overlap if sklearn is unavailable.
    """

    def __init__(self, similarity_threshold: float = 0.35):
        self.similarity_threshold = similarity_threshold
        self._sklearn_available = False
        self._load_deps()

    def _load_deps(self):
        """Attempt to load sklearn dependencies."""
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.metrics.pairwise import cosine_similarity
            self.TfidfVectorizer = TfidfVectorizer
            self.cosine_similarity = cosine_similarity
            self._sklearn_available = True
            logger.info("Sklearn loaded for TF-IDF clustering")
        except ImportError as e:
            logger.warning(f"Sklearn not available for clustering: {e}")

    def cluster(self, concerns: list) -> dict:
        """Cluster similar concerns together.
        
        Args:
            concerns: List of concern text strings.
            
        Returns:
            dict with 'clusters' (list of clusters, each with concern texts and a label)
            and 'num_clusters' (int).
        """
        if not concerns:
            return {"clusters": [], "num_clusters": 0}

        # Remove duplicates and empty strings
        seen = set()
        unique_concerns = []
        for c in concerns:
            c_stripped = c.strip()
            if c_stripped and c_stripped not in seen:
                seen.add(c_stripped)
                unique_concerns.append(c_stripped)

        if not unique_concerns:
            return {"clusters": [], "num_clusters": 0}

        if len(unique_concerns) == 1:
            return {
                "clusters": [{"concerns": unique_concerns, "label": "single_concern", "size": 1}],
                "num_clusters": 1,
            }

        # Try TF-IDF + cosine similarity clustering
        if self._sklearn_available and len(unique_concerns) >= 2:
            try:
                return self._cluster_tfidf(unique_concerns)
            except Exception as e:
                logger.warning(f"TF-IDF clustering failed: {e}, using keyword fallback")

        # Fallback: simple keyword overlap clustering
        return self._cluster_keyword(unique_concerns)

    def _cluster_tfidf(self, concerns: list) -> dict:
        """Cluster using TF-IDF vectorization and cosine similarity."""
        vectorizer = self.TfidfVectorizer(
            max_features=500,
            stop_words="english",
            ngram_range=(1, 2),
        )
        tfidf_matrix = vectorizer.fit_transform(concerns)
        similarity_matrix = self.cosine_similarity(tfidf_matrix)

        # Greedy clustering: group items where similarity > threshold
        n = len(concerns)
        assigned = [False] * n
        clusters = []

        for i in range(n):
            if assigned[i]:
                continue

            # Find all items similar to i
            cluster_indices = [i]
            assigned[i] = True

            for j in range(i + 1, n):
                if not assigned[j] and similarity_matrix[i, j] >= self.similarity_threshold:
                    cluster_indices.append(j)
                    assigned[j] = True

            # Extract cluster concerns
            cluster_concerns = [concerns[idx] for idx in cluster_indices]

            # Generate a label from the most representative concern (shortest with high tf-idf sum)
            representative = min(cluster_concerns, key=len)  # shortest as representative

            clusters.append({
                "concerns": cluster_concerns,
                "label": self._generate_cluster_label(cluster_concerns, representative),
                "size": len(cluster_concerns),
            })

        # Sort clusters by size descending
        clusters.sort(key=lambda c: c["size"], reverse=True)

        return {"clusters": clusters, "num_clusters": len(clusters)}

    def _cluster_keyword(self, concerns: list) -> dict:
        """Fallback clustering using simple keyword overlap."""
        clusters = []
        assigned = [False] * len(concerns)

        for i, concern in enumerate(concerns):
            if assigned[i]:
                continue

            words_i = set(concern.lower().split())
            cluster_indices = [i]
            assigned[i] = True

            for j in range(i + 1, len(concerns)):
                if assigned[j]:
                    continue
                words_j = set(concerns[j].lower().split())
                if not words_i or not words_j:
                    continue
                overlap = len(words_i & words_j) / max(len(words_i), len(words_j))
                if overlap >= 0.3:  # 30% word overlap threshold
                    cluster_indices.append(j)
                    assigned[j] = True

            cluster_concerns = [concerns[idx] for idx in cluster_indices]
            clusters.append({
                "concerns": cluster_concerns,
                "label": self._generate_cluster_label(cluster_concerns, cluster_concerns[0]),
                "size": len(cluster_concerns),
            })

        clusters.sort(key=lambda c: c["size"], reverse=True)
        return {"clusters": clusters, "num_clusters": len(clusters)}

    def _generate_cluster_label(self, concerns: list, representative: str) -> str:
        """Generate a short human-readable label for a cluster."""
        # Extract the first few meaningful words from the representative
        stop_words = {
            "the", "a", "an", "is", "are", "was", "were", "in", "on", "at", "to",
            "for", "of", "and", "or", "but", "not", "with", "this", "that", "it",
            "be", "as", "by", "from", "i", "we", "they", "he", "she", "my", "our",
            "about", "there", "have", "has", "had", "do", "does", "did", "will",
            "would", "can", "could", "should", "may", "might", "all", "very",
        }
        words = representative.split()
        meaningful = [w for w in words if w.lower() not in stop_words and len(w) > 2]
        if meaningful:
            label = " ".join(meaningful[:4])
            if len(label) > 60:
                label = label[:57] + "..."
            return label
        return representative[:40]
