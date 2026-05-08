# Election Status Constants
ELECTION_STATUS_UPCOMING = "upcoming"
ELECTION_STATUS_ACTIVE = "active"
ELECTION_STATUS_PAUSED = "paused"
ELECTION_STATUS_COMPLETED = "completed"
ELECTION_STATUS_CANCELLED = "cancelled"

# User Roles
ROLE_STUDENT = "student"
ROLE_CANDIDATE = "candidate"
ROLE_ADMIN = "admin"

# Candidate Status
CANDIDATE_PENDING = "pending"
CANDIDATE_APPROVED = "approved"
CANDIDATE_REJECTED = "rejected"

# Concern Status
CONCERN_OPEN = "open"
CONCERN_IN_REVIEW = "in_review"
CONCERN_ADDRESSED = "addressed"
CONCERN_CLOSED = "closed"

# Concern Categories
CONCERN_CATEGORIES = ["academic", "infrastructure", "campus_life", "administration", "other"]

# OTP Settings
OTP_EXPIRY_MINUTES = 5
OTP_LENGTH = 6

# Rate Limits
RATE_LIMIT_LOGIN = "5/minute"
RATE_LIMIT_VOTE = "1/minute"
RATE_LIMIT_API = "100/minute"
