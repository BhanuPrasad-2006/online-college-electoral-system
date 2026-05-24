"""Embedding utilities for text vectorization using sentence-transformers."""

import logging
import numpy as np

logger = logging.getLogger(__name__)

# Cache for the model singleton
_model = None
_model_name = "all-MiniLM-L6-v2"


class EmbeddingService:
    """Service for generating text embeddings using sentence-transformers."""

    def __init__(self):
        self.model = None
        self._load_model()

    def _load_model(self):
        """Load the sentence-transformers model (cached globally)."""
        global _model
        if _model is not None:
            self.model = _model
            return

        try:
            from sentence_transformers import SentenceTransformer
            logger.info(f"Loading embedding model: {_model_name}")
            _model = SentenceTransformer(_model_name)
            self.model = _model
            logger.info("Embedding model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load sentence-transformers model: {e}")
            self.model = None

    def embed(self, text: str) -> list:
        """Generate embedding vector for a single text."""
        if self.model is None:
            return [0.0] * 384

        try:
            vec = self.model.encode(text, normalize_embeddings=True)
            return vec.tolist()
        except Exception as e:
            logger.error(f"Embedding failed: {e}")
            return [0.0] * 384

    def embed_batch(self, texts: list) -> list:
        """Generate embeddings for a batch of texts."""
        if self.model is None:
            return [[0.0] * 384 for _ in texts]

        try:
            vecs = self.model.encode(texts, normalize_embeddings=True)
            return [v.tolist() for v in vecs]
        except Exception as e:
            logger.error(f"Batch embedding failed: {e}")
            return [[0.0] * 384 for _ in texts]

    def similarity(self, vec1: list, vec2: list) -> float:
        """Compute cosine similarity between two vectors.
        Vectors are assumed to be normalized (unit length) for efficiency.
        """
        # If either is placeholder, return 0
        if not vec1 or not vec2:
            return 0.0
        if all(v == 0.0 for v in vec1) or all(v == 0.0 for v in vec2):
            return 0.0
        # Cosine similarity for normalized vectors = dot product
        return float(np.dot(vec1, vec2))

    def compute_similarity_scores(self, concern_embedding: list, manifesto_embeddings: list) -> list:
        """Compute similarity between a concern embedding and multiple manifesto embeddings.
        Returns list of (index, score) tuples sorted by descending score.
        """
        scores = []
        for i, manifesto_emb in enumerate(manifesto_embeddings):
            score = self.similarity(concern_embedding, manifesto_emb)
            scores.append((i, score))
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores
