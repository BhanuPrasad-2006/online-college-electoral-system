"""Anomaly service — statistical anomaly detection in voting patterns."""

from datetime import datetime, timedelta, timezone
from sqlalchemy import select, func
from app.models.vote import Vote
from app.models.audit_log import AuditLog


class AnomalyService:
    async def check_voting_burst(self, db_session, election_id: str, threshold: int = 50, window_minutes: int = 5) -> bool:
        """Detect unusual voting bursts."""
        time_limit = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
        query = select(func.count(Vote.vote_id)).where(
            Vote.election_id == election_id,
            Vote.voted_at >= time_limit
        )
        result = await db_session.execute(query)
        count = result.scalar() or 0
        return count > threshold

    async def check_subnet_concentration(self, db_session, election_id: str) -> list:
        """Detect unusual IP subnet concentrations using VOTE_CAST audit logs."""
        time_limit = datetime.now(timezone.utc) - timedelta(minutes=15)
        # Query audit logs for VOTE_CAST in the last 15 minutes
        query = select(AuditLog.ip_address).where(
            AuditLog.event_type == "VOTE_CAST",
            AuditLog.created_at >= time_limit
        )
        result = await db_session.execute(query)
        ips = [str(row[0]) for row in result.all() if row[0]]

        subnets = {}
        for ip in ips:
            # Simple IPv4 check
            parts = ip.split(".")
            if len(parts) >= 3:
                subnet = ".".join(parts[:3])  # /24 subnet
                subnets[subnet] = subnets.get(subnet, 0) + 1

        concentration = []
        for subnet, count in subnets.items():
            if count >= 10:  # Threshold: 10 votes from the same /24 subnet in 15 mins
                concentration.append({
                    "subnet": f"{subnet}.0/24",
                    "count": count,
                    "reason": f"High vote concentration: {count} votes from subnet {subnet}.0/24 in last 15m"
                })
        return concentration

    async def check_temporal_patterns(self, db_session, election_id: str) -> dict:
        """Detect unusual temporal voting patterns (robotic exact intervals)."""
        query = select(Vote.voted_at).where(
            Vote.election_id == election_id
        ).order_by(Vote.voted_at.desc()).limit(30)
        result = await db_session.execute(query)
        voted_ats = [row[0] for row in result.all() if row[0]]

        if len(voted_ats) < 5:
            return {"anomalies": []}

        # Calculate intervals in seconds between consecutive votes
        intervals = []
        for i in range(len(voted_ats) - 1):
            diff = (voted_ats[i] - voted_ats[i + 1]).total_seconds()
            intervals.append(round(diff, 1))

        # Count occurrences of each interval
        from collections import Counter
        counts = Counter(intervals)

        anomalies = []
        for interval, count in counts.items():
            # If a specific interval (e.g. 1.0s, 5.0s) occurs repeatedly (>= 4 times) for quick submissions
            if count >= 4 and interval < 15.0:
                anomalies.append({
                    "interval_seconds": interval,
                    "count": count,
                    "reason": f"Robotic timing interval detected: {count} votes cast with exact {interval}s spacing"
                })
        return {"anomalies": anomalies}
