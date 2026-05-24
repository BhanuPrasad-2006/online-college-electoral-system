"""Report generator module — AI-driven election analysis and report generation."""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


class ReportGenerator:
    """Generates comprehensive election analysis reports.
    Connects classifier, sentiment, clustering, and anomaly detection into one pipeline.
    """

    def __init__(self, classifier=None, sentiment_analyzer=None, clusterer=None, anomaly_detector=None):
        self.classifier = classifier
        self.sentiment_analyzer = sentiment_analyzer
        self.clusterer = clusterer
        self.anomaly_detector = anomaly_detector

    async def generate_election_report(self, election_data: dict) -> dict:
        """Generate a comprehensive election analysis report."""
        results = election_data.get("results", {})
        concerns = election_data.get("concerns", [])
        candidates = election_data.get("candidates", [])
        voting_data = election_data.get("voting_data", {})

        report = {
            "summary": await self._generate_summary(results, candidates),
            "voting_trends": await self._analyze_trends(results),
            "concern_analysis": await self._analyze_concerns(concerns),
            "anomalies": await self._detect_anomalies(voting_data),
            "recommendations": await self._generate_recommendations(results, concerns),
        }
        return report

    async def _generate_summary(self, results: dict, candidates: list) -> str:
        """Generate a natural-language summary of election results."""
        if not results:
            return "Election results data is not yet available."

        try:
            total_votes = results.get("total_votes", 0)
            registered = results.get("registered_voters", 0)
            turnout = round((total_votes / registered * 100), 1) if registered > 0 else 0.0

            summary_parts = [
                f"Total votes cast: {total_votes} out of {registered} registered voters ({turnout}% turnout)."
            ]

            # Position-wise results
            positions = results.get("positions", [])
            if positions:
                for pos in positions:
                    pos_name = pos.get("name", "Position")
                    winner = pos.get("winner", {})
                    if winner:
                        summary_parts.append(
                            f"{pos_name}: Won by {winner.get('name', 'Unknown')} "
                            f"with {winner.get('votes', 0)} votes."
                        )
                    else:
                        summary_parts.append(f"{pos_name}: Results pending.")

            return " ".join(summary_parts)
        except Exception as e:
            logger.error(f"Summary generation failed: {e}")
            return "Election analysis summary is being processed."

    async def _analyze_trends(self, results: dict) -> dict:
        """Analyze voting trends across departments and time periods."""
        trends = {"department_trends": [], "time_trends": []}

        if not results:
            return trends

        try:
            # Department-wise turnout analysis
            departments = results.get("departments", [])
            if departments:
                dept_trends = []
                for dept in departments:
                    dept_name = dept.get("name", "Unknown")
                    total = dept.get("total_voters", 0)
                    voted = dept.get("voted", 0)
                    turnout_pct = round((voted / total * 100), 1) if total > 0 else 0.0

                    dept_trends.append({
                        "department": dept_name,
                        "turnout": turnout_pct,
                        "total_voters": total,
                        "voted": voted,
                    })

                # Sort by turnout descending
                dept_trends.sort(key=lambda d: d["turnout"], reverse=True)
                trends["department_trends"] = dept_trends

            # Hourly voting trends
            hourly = results.get("hourly_data", [])
            if hourly:
                trends["time_trends"] = [
                    {"hour": h.get("hour", "unknown"), "votes": h.get("votes", 0)}
                    for h in hourly
                ]

        except Exception as e:
            logger.error(f"Trend analysis failed: {e}")

        return trends

    async def _analyze_concerns(self, concerns: list) -> dict:
        """Analyze student concerns using the classifier, clusterer, and sentiment analyzer."""
        analysis = {"top_themes": [], "coverage_score": 0.0, "categories": [], "sentiment_summary": {}}

        if not concerns:
            return analysis

        try:
            # Extract concern text
            concern_texts = []
            if isinstance(concerns[0], dict):
                concern_texts = [c.get("content", c.get("text", str(c))) for c in concerns]
            else:
                concern_texts = [str(c) for c in concerns]

            # Classify all concerns
            if self.classifier:
                categories = self.classifier.classify_batch(concern_texts)
            else:
                categories = ["other"] * len(concern_texts)

            # Sentiment analysis on all concerns
            if self.sentiment_analyzer:
                sentiments = [self.sentiment_analyzer.analyze(t) for t in concern_texts]
            else:
                sentiments = [0.0] * len(concern_texts)

            # Cluster similar concerns
            if self.clusterer:
                clustering_result = self.clusterer.cluster(concern_texts)
                top_themes = [
                    {"theme": c["label"], "size": c["size"]}
                    for c in clustering_result.get("clusters", [])[:5]
                ]
                analysis["top_themes"] = top_themes
                analysis["num_clusters"] = clustering_result.get("num_clusters", 0)

            # Aggregate by category
            cat_counts = {}
            for cat in categories:
                cat_counts[cat] = cat_counts.get(cat, 0) + 1

            total = len(categories)
            analysis["categories"] = [
                {"name": cat, "count": count, "percentage": round(count / total * 100, 1)}
                for cat, count in sorted(cat_counts.items(), key=lambda x: x[1], reverse=True)
            ]

            # Sentiment summary
            if sentiments:
                avg_sentiment = sum(sentiments) / len(sentiments)
                positive_ratio = sum(1 for s in sentiments if s > 0.1) / len(sentiments)
                negative_ratio = sum(1 for s in sentiments if s < -0.1) / len(sentiments)
                analysis["sentiment_summary"] = {
                    "average_sentiment": round(avg_sentiment, 3),
                    "positive_ratio": round(positive_ratio, 3),
                    "negative_ratio": round(negative_ratio, 3),
                    "overall_mood": "positive" if avg_sentiment > 0.1 else ("negative" if avg_sentiment < -0.1 else "neutral"),
                }

            # Coverage score: how well categories match typical candidate manifesto themes
            if "academic" in cat_counts or "infrastructure" in cat_counts:
                covered = sum(1 for cat in ["academic", "infrastructure", "campus_life", "administration"] if cat in cat_counts)
                analysis["coverage_score"] = round(covered / 4, 2)

        except Exception as e:
            logger.error(f"Concern analysis failed: {e}")

        return analysis

    async def _detect_anomalies(self, voting_data: dict) -> list:
        """Detect statistical anomalies in voting data using the anomaly detector."""
        if not voting_data:
            return []

        try:
            if self.anomaly_detector:
                return self.anomaly_detector.detect(voting_data)
            return []
        except Exception as e:
            logger.error(f"Anomaly detection failed: {e}")
            return []

    async def _generate_recommendations(self, results: dict, concerns: list) -> list:
        """Generate actionable recommendations based on election data and concerns."""
        recommendations = []

        if not results and not concerns:
            return recommendations

        try:
            # Turnout-based recommendations
            total_votes = results.get("total_votes", 0)
            registered = results.get("registered_voters", 0)
            if registered > 0:
                turnout = total_votes / registered
                if turnout < 0.5:
                    recommendations.append({
                        "type": "turnout",
                        "priority": "high",
                        "message": "Voter turnout is below 50%. Consider extending voting hours or sending reminders.",
                    })
                elif turnout < 0.75:
                    recommendations.append({
                        "type": "turnout",
                        "priority": "medium",
                        "message": f"Voter turnout is {round(turnout * 100, 1)}%. Continue awareness campaigns.",
                    })

            # Department-based recommendations
            departments = results.get("departments", [])
            low_turnout_depts = [d for d in departments if d.get("voted", 0) / max(d.get("total_voters", 1), 1) < 0.4]
            if low_turnout_depts:
                dept_names = [d.get("name", "Unknown") for d in low_turnout_depts[:3]]
                recommendations.append({
                    "type": "department_focus",
                    "priority": "medium",
                    "message": f"Low turnout detected in: {', '.join(dept_names)}. Targeted outreach recommended.",
                })

            # Concern-based recommendations
            if concerns:
                recommendations.append({
                    "type": "concern_awareness",
                    "priority": "info",
                    "message": f"{len(concerns)} student concerns submitted. Review concern analysis for actionable insights.",
                })

        except Exception as e:
            logger.error(f"Recommendation generation failed: {e}")

        return recommendations
