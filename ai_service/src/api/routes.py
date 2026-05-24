import os
import re
import unicodedata
from fastapi import APIRouter, Security, HTTPException, status, Depends
from fastapi.security.api_key import APIKeyHeader

from src.api.schemas import (
    ClassifyRequest, ClassifyResponse,
    ManifestoAnalysisRequest, ManifestoAnalysisResponse,
    RecommendationRequest, RecommendationResponse,
    CandidateInfo,
    AnomalyRequest, AnomalyResponse,
    ChatRequest, ChatResponse,
    ClusterRequest, ClusterResponse,
    ClusterItem,
    CampusReportRequest, CampusReportResponse,
)
from src.utils.logger import logger
from src.modules.classifier import ConcernClassifier
from src.modules.sentiment import SentimentAnalyzer
from src.modules.manifesto import ManifestoAnalyzer
from src.modules.anomaly_detection import AnomalyDetector
from src.modules.recommendation import RecommendationEngine
from src.modules.clustering import ConcernClusterer
from src.modules.report_generator import ReportGenerator
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
clusterer = ConcernClusterer()
report_generator = ReportGenerator(
    classifier=classifier,
    sentiment_analyzer=sentiment,
    clusterer=clusterer,
    anomaly_detector=anomaly_detector,
)
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

    # Convert provided candidates to dict format if present
    candidates = None
    if request.candidates:
        candidates = [
            {"id": c.id, "name": c.name, "manifesto": c.manifesto}
            for c in request.candidates
        ]

    results = recommender.recommend(sanitized_concerns, candidates=candidates)
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


@router.post("/analyze-pipeline")
async def run_analysis_pipeline(request: AnomalyRequest):
    """End-to-end analysis pipeline: concerns -> classify -> cluster -> sentiment -> report."""
    election_data = request.voting_data
    concerns = election_data.get("concerns", [])

    if not concerns:
        return {
            "classifications": [],
            "sentiments": [],
            "clustering": {"clusters": [], "num_clusters": 0},
            "recommendations": [],
            "report": None,
        }

    # Step 1: Classify all concerns
    classifications = []
    for concern in concerns:
        text = concern.get("content", concern.get("text", "")) if isinstance(concern, dict) else str(concern)
        sanitized = sanitize_text(text)
        category = classifier.classify(sanitized)
        sentiment_score = sentiment.analyze(sanitized)
        classifications.append({
            "text": sanitized[:100],
            "category": category,
            "sentiment": sentiment_score,
        })

    # Step 2: Extract concern texts for clustering
    concern_texts = []
    if isinstance(concerns[0], dict):
        concern_texts = [c.get("content", c.get("text", "")) for c in concerns]
    else:
        concern_texts = [str(c) for c in concerns]
    concern_texts = [sanitize_text(t) for t in concern_texts if t]

    # Step 3: Cluster concerns
    clustering_result = clusterer.cluster(concern_texts)

    # Step 4: Generate recommendations based on concerns
    recommendations = recommender.recommend(
        concern_texts,
        candidates=election_data.get("candidates", None),
    )

    # Step 5: Generate full report
    report = await report_generator.generate_election_report(election_data)

    return {
        "classifications": classifications,
        "sentiments": [c["sentiment"] for c in classifications],
        "clustering": clustering_result,
        "recommendations": recommendations,
        "report": report,
    }


@router.post("/cluster", response_model=ClusterResponse)
async def cluster_concerns(request: ClusterRequest):
    """Cluster similar concern texts together."""
    sanitized_texts = [sanitize_text(t) for t in request.texts if t.strip()]
    if not sanitized_texts:
        return ClusterResponse(clusters=[], num_clusters=0, unclustered=[])
    result = clusterer.cluster(sanitized_texts)
    # Save the cluster assignments for each input text
    assignment = {}
    for i, cluster in enumerate(result.get("clusters", [])):
        for concern in cluster.get("concerns", []):
            assignment[concern] = i
    unclustered = [t for t in sanitized_texts if t not in assignment]
    return ClusterResponse(
        clusters=[
            ClusterItem(
                cluster_id=i,
                label=c.get("label", f"Cluster {i+1}"),
                size=c.get("size", len(c.get("concerns", []))),
                concerns=c.get("concerns", []),
            )
            for i, c in enumerate(result.get("clusters", []))
        ],
        num_clusters=result.get("num_clusters", 0),
        unclustered=unclustered,
    )


@router.post("/generate-report")
async def generate_report(request: AnomalyRequest):
    """Generate a comprehensive election analysis report."""
    report = await report_generator.generate_election_report(request.voting_data)
    return report


@router.post("/campus-report", response_model=CampusReportResponse)
async def generate_campus_report(request: CampusReportRequest):
    """
    Generate a "State of the Campus" report from aggregated concern data.
    Uses Gemini to produce an executive summary, key findings, and recommendations.
    """
    import json
    from src.utils.gemini import call_gemini
    from pydantic import BaseModel, Field

    class CampusReportSchema(BaseModel):
        executive_summary: str = Field(..., description="2-3 paragraph executive summary of the overall campus sentiment and key issues")
        key_findings: list[str] = Field(..., description="5-8 bullet-point key findings from the data")
        trend_analysis: str = Field(..., description="1-2 paragraph analysis of sentiment and category trends")
        suggested_actions: list[str] = Field(..., description="4-6 actionable recommendations for the administration")

    # Build a concise data summary for the prompt
    data = request.data
    total = data.get("total_concerns", 0)
    total_clusters = data.get("total_clusters", 0)
    unclustered = data.get("unclustered_count", 0)
    sentiment = data.get("sentiment_summary", {})
    categories = data.get("category_distribution", {})
    clusters = data.get("clusters", [])

    # Summarize top clusters for the prompt
    top_clusters = sorted(clusters, key=lambda c: c.get("size", 0), reverse=True)[:5]
    cluster_lines = []
    for cl in top_clusters:
        texts = cl.get("representative_texts", [])[:2]
        cluster_lines.append(
            f"- Size {cl.get('size', 0)}: {cl.get('category', 'mixed')} — "
            f"e.g. '{texts[0] if texts else 'N/A'}'"
        )

    prompt = (
        f"Generate a 'State of the Campus' report based on the following student concern data:\n\n"
        f"Total concerns submitted: {total}\n"
        f"Unique issue clusters identified: {total_clusters}\n"
        f"Unclustered concerns: {unclustered}\n\n"
        f"Overall sentiment: {json.dumps(sentiment)}\n"
        f"Category distribution: {json.dumps(categories)}\n\n"
        f"Top issue clusters:\n" + "\n".join(cluster_lines) + "\n\n"
        f"Please provide:\n"
        f"1. An executive summary of the overall campus climate based on these concerns\n"
        f"2. Key findings as concise bullet points\n"
        f"3. Analysis of sentiment and category trends\n"
        f"4. Suggested actions for the administration"
    )

    system_instruction = (
        "You are an expert campus climate analyst generating a neutral, data-driven "
        "'State of the Campus' report for college administration. Your tone must be "
        "professional, objective, and actionable. Focus on the data provided — do not "
        "speculate beyond what the data shows. Respond in strict JSON format conforming "
        "to the requested schema."
    )

    try:
        response_text = call_gemini(
            prompt=prompt,
            system_instruction=system_instruction,
            response_schema=CampusReportSchema,
            response_mime_type="application/json",
        )
        result = json.loads(response_text)
        return CampusReportResponse(
            executive_summary=result.get("executive_summary", "Report generation in progress."),
            key_findings=result.get("key_findings", ["No key findings available."]),
            trend_analysis=result.get("trend_analysis", "Trend analysis not available."),
            suggested_actions=result.get("suggested_actions", ["No suggestions available."]),
        )
    except Exception as e:
        logger.error(f"Campus report generation failed: {e}")
        # Fallback: generate template-based report
        pos_count = sentiment.get("positive", 0)
        neg_count = sentiment.get("negative", 0)
        neutral_count = sentiment.get("neutral", 0)
        top_cat = max(categories, key=categories.get) if categories else "N/A"

        return CampusReportResponse(
            executive_summary=(
                f"This campus report analyzes {total} student concerns submitted across the campus. "
                f"The concerns span {len(categories)} categories, with the most frequent being "
                f"'{top_cat}'. Sentiment across all submissions is predominantly "
                f"{'positive' if pos_count > neg_count else 'negative' if neg_count > pos_count else 'neutral'} "
                f"({pos_count} positive, {neutral_count} neutral, {neg_count} negative). "
                f"The {total_clusters} identified clusters represent distinct issue areas that "
                f"warrant administrative attention."
            ),
            key_findings=[
                f"{len(categories)} distinct categories of concern identified",
                f"Top category: {top_cat} with {categories.get(top_cat, 0)} submissions",
                f"{total_clusters} unique issue clusters detected across all concerns",
                f"Sentiment is {'broadly positive' if pos_count > neg_count else 'leaning negative' if neg_count > pos_count else 'neutral'} overall",
                f"{unclustered} concerns remain ungrouped and may represent isolated issues",
            ],
            trend_analysis=(
                f"The data reveals {total_clusters} distinct clusters of concern, suggesting "
                f"that students are raising issues across multiple areas rather than focusing "
                f"on a single problem. The '{top_cat}' category dominates, indicating this is "
                f"the most pressing area from the student perspective. "
                f"With {pos_count} positive, {neutral_count} neutral, and {neg_count} negative "
                f"sentiment entries, the overall campus mood appears "
                f"{'constructive' if pos_count >= neg_count else 'concerning'}."
            ),
            suggested_actions=[
                f"Prioritize addressing issues in the '{top_cat}' category which received the most submissions",
                "Review the top concern clusters for systemic patterns requiring policy changes",
                "Consider a town hall forum to address the most frequently raised issues",
                "Share this report with relevant departments for targeted action planning",
                "Continue monitoring concern submissions to track resolution progress",
            ],
        )
