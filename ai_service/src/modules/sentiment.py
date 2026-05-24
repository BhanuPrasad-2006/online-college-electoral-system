"""Sentiment analysis module using TextBlob."""

import logging

logger = logging.getLogger(__name__)


class SentimentAnalyzer:
    """Analyzes sentiment of text using TextBlob.
    Returns a score from -1.0 (very negative) to 1.0 (very positive).
    Falls back to VADER if TextBlob is unavailable, then to simple keyword matching.
    """

    def __init__(self):
        self._textblob_available = False
        self._vader_available = False
        self._load_models()

    def _load_models(self):
        """Attempt to load TextBlob first, then VADER as fallback."""
        try:
            import textblob
            # Download corpora if needed (silent)
            try:
                import nltk
                nltk.data.find('tokenizers/punkt')
            except (LookupError, ImportError):
                try:
                    import nltk
                    nltk.download('punkt', quiet=True)
                except Exception:
                    pass
            self._textblob_available = True
            logger.info("TextBlob loaded for sentiment analysis")
            return
        except ImportError:
            logger.warning("TextBlob not available, trying VADER fallback")

        try:
            from nltk.sentiment import SentimentIntensityAnalyzer
            try:
                nltk.data.find('sentiment/vader_lexicon')
            except LookupError:
                nltk.download('vader_lexicon', quiet=True)
            self._vader = SentimentIntensityAnalyzer()
            self._vader_available = True
            logger.info("VADER loaded for sentiment analysis")
            return
        except (ImportError, LookupError) as e:
            logger.warning(f"VADER not available either: {e}")

    def analyze(self, text: str) -> float:
        """Analyze sentiment of text. Returns score from -1.0 to 1.0."""
        if not text or not text.strip():
            return 0.0

        # Try TextBlob first
        if self._textblob_available:
            try:
                from textblob import TextBlob
                blob = TextBlob(text)
                return float(blob.sentiment.polarity)
            except Exception as e:
                logger.error(f"TextBlob analysis failed: {e}")

        # Try VADER as first fallback
        if self._vader_available:
            try:
                scores = self._vader.polarity_scores(text)
                return float(scores['compound'])
            except Exception as e:
                logger.error(f"VADER analysis failed: {e}")

        # Final fallback: simple keyword-based scoring
        positive_words = {
            "good", "great", "excellent", "amazing", "wonderful", "fantastic",
            "improve", "better", "best", "love", "perfect", "helpful", "happy",
            "satisfied", "impressive", "outstanding", "superb", "awesome",
            "efficient", "effective", "reliable", "clean", "safe", "modern",
        }
        negative_words = {
            "bad", "poor", "terrible", "awful", "horrible", "worst",
            "broken", "slow", "worst", "hate", "useless", "frustrating",
            "disappointed", "unhappy", "unsatisfied", "dirty", "unsafe",
            "outdated", "crowded", "expensive", "unfair", "biased",
        }

        words = set(text.lower().split())
        pos_count = sum(1 for w in words if w in positive_words)
        neg_count = sum(1 for w in words if w in negative_words)
        total = pos_count + neg_count
        if total == 0:
            return 0.0
        return (pos_count - neg_count) / total
