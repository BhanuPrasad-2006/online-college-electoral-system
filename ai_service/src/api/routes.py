from fastapi import APIRouter
from src.api.schemas import (
    ClassifyRequest, ClassifyResponse,
    ManifestoAnalysisRequest, ManifestoAnalysisResponse,
    RecommendationRequest, RecommendationResponse,
    AnomalyRequest, AnomalyResponse,
)
from src.modules.classifier import ConcernClassifier
from src.modules.sentiment import SentimentAnalyzer
from src.modules.manifesto import ManifestoAnalyzer
from src.modules.anomaly_detection import AnomalyDetector
from src.modules.recommendation import RecommendationEngine

router = APIRouter()

classifier = ConcernClassifier()
sentiment = SentimentAnalyzer()
manifesto_analyzer = ManifestoAnalyzer()
anomaly_detector = AnomalyDetector()
recommender = RecommendationEngine()


@router.post("/classify", response_model=ClassifyResponse)
async def classify_concern(request: ClassifyRequest):
    """Classify a student concern into categories."""
    category = classifier.classify(request.text)
    sentiment_score = sentiment.analyze(request.text)
    return ClassifyResponse(category=category, confidence=0.85, sentiment_score=sentiment_score)


@router.post("/analyze-manifesto", response_model=ManifestoAnalysisResponse)
async def analyze_manifesto(request: ManifestoAnalysisRequest):
    """Analyze a candidate's manifesto."""
    result = manifesto_analyzer.analyze(request.content)
    return ManifestoAnalysisResponse(**result)


@router.post("/recommend", response_model=list[RecommendationResponse])
async def get_recommendations(request: RecommendationRequest):
    """Get AI-powered candidate recommendations."""
    results = recommender.recommend(request.concerns)
    return results


@router.post("/detect-anomalies", response_model=AnomalyResponse)
async def detect_anomalies(request: AnomalyRequest):
    """Detect voting anomalies."""
    anomalies = anomaly_detector.detect(request.voting_data)
    return AnomalyResponse(anomalies=anomalies)
