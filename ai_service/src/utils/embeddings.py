"""Embedding utilities for text vectorization."""


class EmbeddingService:
    def __init__(self):
        # TODO: Load sentence-transformers model
        self.model = None

    def embed(self, text: str) -> list:
        """Generate embedding vector for text."""
        # TODO: Use sentence-transformers
        return [0.0] * 384  # placeholder

    def embed_batch(self, texts: list) -> list:
        """Generate embeddings for a batch of texts."""
        return [self.embed(t) for t in texts]

    def similarity(self, vec1: list, vec2: list) -> float:
        """Compute cosine similarity between two vectors."""
        dot = sum(a * b for a, b in zip(vec1, vec2))
        mag1 = sum(a * a for a in vec1) ** 0.5
        mag2 = sum(b * b for b in vec2) ** 0.5
        if mag1 == 0 or mag2 == 0:
            return 0.0
        return dot / (mag1 * mag2)
