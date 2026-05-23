"""Fraud detection service — AI-powered fraud detection orchestrator."""

import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.ai_alert import AIAlert
from app.enums.alert_type import AlertTypeEnum
from app.enums.alert_severity import AlertSeverityEnum
from app.security.honeypot import HoneypotService
from app.security.anomaly_service import AnomalyService
from app.utils.logger import logger


class FraudDetectionService:
    def __init__(self):
        self.honeypot = HoneypotService()
        self.anomaly = AnomalyService()

    async def analyze_vote(self, db_session: AsyncSession, vote_data: dict) -> dict:
        """
        Analyze a single vote for fraud indicators and generate warnings/alerts.
        Do NOT block votes initially, only flag suspicious behavior for admin review.
        """
        election_id = vote_data.get("election_id")
        ip_address = vote_data.get("ip_address")
        submit_time_ms = vote_data.get("submit_time_ms")
        trap_data = vote_data.get("trap_data") or {}

        reasons = []
        is_suspicious = False
        confidence = 0.0
        severity = AlertSeverityEnum.LOW

        # 1. Honeypot check
        honeypot_triggered = self.honeypot.check_trap(trap_data)
        if honeypot_triggered:
            is_suspicious = True
            confidence = max(confidence, 0.95)
            reasons.append("Honeypot trap triggered (bot field populated)")
            severity = AlertSeverityEnum.HIGH

        # 2. Timing check
        if submit_time_ms is not None:
            timing_triggered = self.honeypot.validate_timing(submit_time_ms)
            if timing_triggered:
                is_suspicious = True
                confidence = max(confidence, 0.8)
                reasons.append(f"Suspicious fast submission: {submit_time_ms}ms")
                severity = max(severity, AlertSeverityEnum.MEDIUM, key=lambda x: [AlertSeverityEnum.LOW, AlertSeverityEnum.MEDIUM, AlertSeverityEnum.HIGH, AlertSeverityEnum.CRITICAL].index(x))

        # 3. Anomaly checks (Velocity burst)
        if election_id:
            try:
                burst_detected = await self.anomaly.check_voting_burst(db_session, election_id)
                if burst_detected:
                    is_suspicious = True
                    confidence = max(confidence, 0.75)
                    reasons.append("High vote velocity burst detected")
                    alert = AIAlert(
                        alert_id=str(uuid.uuid4()),
                        election_id=election_id,
                        alert_type=AlertTypeEnum.VELOCITY_ANOMALY,
                        severity=AlertSeverityEnum.MEDIUM,
                        description="Velocity burst detected in voting flow.",
                        ip_address=ip_address,
                        confidence_score=0.75,
                        is_resolved=False
                    )
                    db_session.add(alert)
            except Exception as e:
                logger.error(f"Error checking voting burst: {e}")

            # 4. IP clustering / Subnet concentration
            try:
                concentrations = await self.anomaly.check_subnet_concentration(db_session, election_id)
                for item in concentrations:
                    is_suspicious = True
                    confidence = max(confidence, 0.85)
                    reasons.append(item["reason"])
                    alert = AIAlert(
                        alert_id=str(uuid.uuid4()),
                        election_id=election_id,
                        alert_type=AlertTypeEnum.IP_CLUSTERING,
                        severity=AlertSeverityEnum.HIGH,
                        description=item["reason"],
                        ip_address=ip_address,
                        confidence_score=0.85,
                        is_resolved=False
                    )
                    db_session.add(alert)
            except Exception as e:
                logger.error(f"Error checking subnet concentration: {e}")

            # 5. Temporal interval check
            try:
                temporal = await self.anomaly.check_temporal_patterns(db_session, election_id)
                for item in temporal.get("anomalies", []):
                    is_suspicious = True
                    confidence = max(confidence, 0.9)
                    reasons.append(item["reason"])
                    alert = AIAlert(
                        alert_id=str(uuid.uuid4()),
                        election_id=election_id,
                        alert_type=AlertTypeEnum.BEHAVIORAL,
                        severity=AlertSeverityEnum.HIGH,
                        description=item["reason"],
                        ip_address=ip_address,
                        confidence_score=0.9,
                        is_resolved=False
                    )
                    db_session.add(alert)
            except Exception as e:
                logger.error(f"Error checking temporal patterns: {e}")

        # If overall honeypot or timing triggered, save a behavioral alert too
        if honeypot_triggered or (submit_time_ms is not None and self.honeypot.validate_timing(submit_time_ms)):
            alert_desc = f"Client side honeypot triggered: {', '.join(reasons)}"
            alert = AIAlert(
                alert_id=str(uuid.uuid4()),
                election_id=election_id,
                alert_type=AlertTypeEnum.BEHAVIORAL,
                severity=severity,
                description=alert_desc,
                ip_address=ip_address,
                confidence_score=confidence,
                is_resolved=False
            )
            db_session.add(alert)

        if is_suspicious:
            try:
                await db_session.commit()
            except Exception as e:
                logger.error(f"Error committing AI alerts: {e}")
                await db_session.rollback()

        return {
            "is_suspicious": is_suspicious,
            "confidence": confidence,
            "reasons": reasons
        }

    async def get_alerts(self, db_session: AsyncSession, resolved: bool = None) -> list:
        """Query AI alerts from the database."""
        query = select(AIAlert).order_by(AIAlert.created_at.desc())
        if resolved is not None:
            query = query.where(AIAlert.is_resolved == resolved)
        
        result = await db_session.execute(query)
        alerts = result.scalars().all()
        return [
            {
                "alert_id": str(a.alert_id),
                "election_id": str(a.election_id) if a.election_id else None,
                "alert_type": a.alert_type.value if hasattr(a.alert_type, "value") else str(a.alert_type),
                "severity": a.severity.value if hasattr(a.severity, "value") else str(a.severity),
                "description": a.description,
                "ip_address": a.ip_address,
                "confidence_score": a.confidence_score or 0.0,
                "is_resolved": a.is_resolved,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "resolved_by": a.resolved_by
            }
            for a in alerts
        ]

    async def resolve_alert(self, db_session: AsyncSession, alert_id: str, resolver_id: str):
        """Mark a fraud alert as resolved."""
        query = select(AIAlert).where(AIAlert.alert_id == alert_id)
        result = await db_session.execute(query)
        alert = result.scalar_one_or_none()
        if alert:
            alert.is_resolved = True
            alert.resolved_by = resolver_id
            await db_session.commit()
            return True
        return False

