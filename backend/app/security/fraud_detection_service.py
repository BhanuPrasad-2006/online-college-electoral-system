"""Fraud detection service — AI-powered fraud detection orchestrator."""

import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.ai_alert import AIAlert
from app.models.admin_user import AdminUser
from app.enums.alert_type import AlertTypeEnum
from app.enums.alert_severity import AlertSeverityEnum
from app.security.honeypot import HoneypotService
from app.security.anomaly_service import AnomalyService
from app.services.email_service import send_election_email
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
        if isinstance(election_id, str):
            try:
                election_id = uuid.UUID(election_id)
            except ValueError:
                pass
        ip_address = vote_data.get("ip_address")
        submit_time_ms = vote_data.get("submit_time_ms")
        trap_data = vote_data.get("trap_data") or {}

        # Log honeypot field values for debugging
        logger.info(
            f"HONEYPOT_CHECK "
            f"vfield_confirm={repr(trap_data.get('verification_field_confirm'))} "
            f"hidden_field={repr(trap_data.get('hidden_field_name'))} "
            f"phone_confirm={repr(trap_data.get('phone_confirm'))} "
            f"submit_time_ms={vote_data.get('submit_time_ms')}"
        )

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

            # ── Notify all admins via email on honeypot/bot detection ──
            await self._notify_admins(db_session, reasons, ip_address, severity, confidence)

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

    async def _notify_admins(self, db_session: AsyncSession, reasons: list, ip_address: str, severity: AlertSeverityEnum, confidence: float):
        """Send email notification to all admin users when a honeypot/bot alert is triggered."""
        try:
            result = await db_session.execute(select(AdminUser))
            admins = result.scalars().all()
            if not admins:
                logger.warning("No admin users found to send honeypot alert email.")
                return

            timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            reasons_html = "<ul>" + "".join(f"<li>{r}</li>" for r in reasons) + "</ul>"
            severity_icon = "🔴" if severity in (AlertSeverityEnum.HIGH, AlertSeverityEnum.CRITICAL) else "🟡"
            confidence_pct = f"{confidence * 100:.0f}%"

            subject = f"{severity_icon} Suspicious Activity Detected — College Election System"

            html_body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; max-width: 560px; margin: auto; padding: 24px;">
                <div style="background: #dc2626; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h2 style="color: white; margin: 0;">🚨 Fraud Alert — Bot Detection</h2>
                </div>
                <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
                    <p style="color: #374151; font-size: 16px;">
                        The honeypot system has detected automated/bot activity during vote submission.
                    </p>
                    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 16px 0; border-radius: 0 6px 6px 0;">
                        <p style="color: #991b1b; margin: 0 0 8px 0; font-weight: bold;">Alert Details</p>
                        <table style="font-size: 13px; color: #374151; border-collapse: collapse; width: 100%;">
                            <tr><td style="padding: 4px 8px; font-weight: 600;">Severity:</td><td style="padding: 4px 8px;">{severity.value if hasattr(severity, 'value') else severity}</td></tr>
                            <tr><td style="padding: 4px 8px; font-weight: 600;">Confidence:</td><td style="padding: 4px 8px;">{confidence_pct}</td></tr>
                            <tr><td style="padding: 4px 8px; font-weight: 600; vertical-align: top;">Reasons:</td><td style="padding: 4px 8px;">{reasons_html}</td></tr>
                            <tr><td style="padding: 4px 8px; font-weight: 600;">IP Address:</td><td style="padding: 4px 8px; font-family: monospace;">{ip_address or 'Unknown'}</td></tr>
                            <tr><td style="padding: 4px 8px; font-weight: 600;">Timestamp:</td><td style="padding: 4px 8px;">{timestamp}</td></tr>
                        </table>
                    </div>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                    <p style="color: #6b7280; font-size: 13px; text-align: center;">
                        📋 This alert is also visible in the AI Monitoring dashboard under Behavioral Alerts.<br>
                        Please investigate the IP address and take appropriate action.
                    </p>
                </div>
            </body>
            </html>
            """

            for admin in admins:
                try:
                    await send_election_email(
                        to_email=admin.email,
                        recipient_name=admin.full_name,
                        subject=subject,
                        html_body=html_body,
                    )
                    logger.info(f"Honeypot alert email sent to admin {admin.email}")
                except Exception as e:
                    logger.error(f"Failed to send honeypot alert email to admin {admin.email}: {e}")

        except Exception as e:
            logger.error(f"Error sending honeypot admin notifications: {e}")

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

