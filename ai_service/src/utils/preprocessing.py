"""Text preprocessing utilities."""

import re


def clean_text(text: str) -> str:
    """Clean and normalize text."""
    text = re.sub(r'[^\w\s]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip().lower()


def tokenize(text: str) -> list:
    """Simple whitespace tokenization."""
    return clean_text(text).split()


def remove_stopwords(tokens: list) -> list:
    """Remove common English stopwords."""
    stopwords = {"the", "a", "an", "is", "are", "was", "were", "in", "on", "at", "to", "for", "of", "and", "or", "but", "not", "with", "this", "that", "it", "be", "as", "by", "from"}
    return [t for t in tokens if t not in stopwords]
