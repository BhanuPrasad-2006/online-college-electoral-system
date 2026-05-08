"""Concern classifier — categorizes student concerns using NLP."""


class ConcernClassifier:
    CATEGORIES = ["academic", "infrastructure", "campus_life", "administration", "other"]

    def __init__(self):
        # TODO: Load pre-trained model or use transformer
        self.model = None

    def classify(self, text: str) -> str:
        """Classify concern text into a category."""
        text_lower = text.lower()
        keyword_map = {
            "academic": ["library", "course", "exam", "lab", "professor", "class", "grade", "syllabus"],
            "infrastructure": ["building", "water", "wifi", "internet", "ac", "road", "parking", "canteen"],
            "campus_life": ["event", "club", "sports", "cultural", "fest", "hostel", "food"],
            "administration": ["fee", "admission", "id card", "certificate", "transparency", "office"],
        }

        for category, keywords in keyword_map.items():
            if any(kw in text_lower for kw in keywords):
                return category
        return "other"
