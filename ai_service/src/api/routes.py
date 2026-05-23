import os
import re
import unicodedata
from fastapi import APIRouter, Security, HTTPException, status, Depends
from fastapi.security.api_key import APIKeyHeader

from src.api.schemas import (
    ClassifyRequest, ClassifyResponse,
    ManifestoAnalysisRequest, ManifestoAnalysisResponse,
    RecommendationRequest, RecommendationResponse,
    AnomalyRequest, AnomalyResponse,
    ChatRequest, ChatResponse,
)
from src.modules.classifier import ConcernClassifier
from src.modules.sentiment import SentimentAnalyzer
from src.modules.manifesto import ManifestoAnalyzer
from src.modules.anomaly_detection import AnomalyDetector
from src.modules.recommendation import RecommendationEngine
from src.modules.chatbot import ChatbotHelper

AI_SERVICE_API_KEY = os.getenv("AI_SERVICE_API_KEY", "default-ai-service-key-change-in-prod")
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def verify_api_key(x_api_key: str = Security(api_key_header)):
    if not x_api_key or x_api_key != AI_SERVICE_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API Key"
        )

router = APIRouter(dependencies=[Depends(verify_api_key)])

classifier = ConcernClassifier()
sentiment = SentimentAnalyzer()
manifesto_analyzer = ManifestoAnalyzer()
anomaly_detector = AnomalyDetector()
recommender = RecommendationEngine()
chatbot_helper = ChatbotHelper()


def sanitize_text(text: str, max_length: int = 5000) -> str:
    if not text:
        return ""
    # 1. Length limiting
    text = text[:max_length]
    # 2. HTML stripping
    text = re.sub(r"<[^>]*>", "", text)
    # 3. Unicode normalization
    text = unicodedata.normalize("NFKC", text)
    # 4. Control character filtering
    text = "".join(ch for ch in text if not unicodedata.category(ch).startswith("C") or ch in "\n\r\t")
    # 5. Prompt sanitization
    injection_patterns = [
        r"(ignore\s+previous\s+instructions|ignore\s+above\s+instructions)",
        r"(you\s+must\s+now\s+act\s+as|you\s+are\s+now\s+a)",
        r"(system\s+prompt|system\s+command)",
        r"(reveal\s+your\s+instructions|what\s+is\s+your\s+prompt)"
    ]
    for pattern in injection_patterns:
        text = re.sub(pattern, "[REDACTED PATTERN]", text, flags=re.IGNORECASE)
    return text.strip()


@router.post("/classify", response_model=ClassifyResponse)
async def classify_concern(request: ClassifyRequest):
    """Classify a student concern into categories."""
    sanitized_text = sanitize_text(request.text)
    category = classifier.classify(sanitized_text)
    sentiment_score = sentiment.analyze(sanitized_text)
    return ClassifyResponse(category=category, confidence=0.85, sentiment_score=sentiment_score)


@router.post("/analyze-manifesto", response_model=ManifestoAnalysisResponse)
async def analyze_manifesto(request: ManifestoAnalysisRequest):
    """Analyze a candidate's manifesto."""
    sanitized_content = sanitize_text(request.content, max_length=15000)
    result = manifesto_analyzer.analyze(sanitized_content)
    return ManifestoAnalysisResponse(**result)


@router.post("/recommend", response_model=list[RecommendationResponse])
async def get_recommendations(request: RecommendationRequest):
    """Get AI-powered candidate recommendations."""
    sanitized_concerns = [sanitize_text(c) for c in request.concerns]
    results = recommender.recommend(sanitized_concerns)
    return results


@router.post("/detect-anomalies", response_model=AnomalyResponse)
async def detect_anomalies(request: AnomalyRequest):
    """Detect voting anomalies."""
    anomalies = anomaly_detector.detect(request.voting_data)
    return AnomalyResponse(anomalies=anomalies)


@router.post("/chatbot", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Ask the politically neutral chatbot a question."""
    sanitized_message = sanitize_text(request.message)
    result = chatbot_helper.ask(sanitized_message)
    return ChatResponse(**result)
