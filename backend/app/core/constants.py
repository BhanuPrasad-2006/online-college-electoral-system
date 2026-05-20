"""
Centralized constants.

IMPORTANT: For enum values (roles, statuses, categories), always use the
centralized enums in app/enums/ instead of hardcoded strings.

  from app.enums.roles import UserRoleEnum
  from app.enums.election_status import ElectionStatusEnum
  from app.enums.candidate_status import CandidateStatusEnum
  from app.enums.otp_type import OTPTypeEnum
  from app.enums.alert_type import AlertTypeEnum
  from app.enums.alert_severity import AlertSeverityEnum
  from app.enums.concern_enums import ConcernCategoryEnum, SentimentEnum
"""

# ── Rate Limits ───────────────────────────────────────────────
RATE_LIMIT_LOGIN = "5/minute"
RATE_LIMIT_VOTE  = "1/minute"
RATE_LIMIT_API   = "100/minute"
