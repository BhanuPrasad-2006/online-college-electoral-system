from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings


# ── Token type constants ─────────────────────────────────────
TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_VOTING = "voting"
TOKEN_TYPE_OTP_SESSION = "otp_session"

# ── Duration constants ───────────────────────────────────────
NORMAL_TOKEN_EXPIRE_DAYS = 7          # General platform session
VOTING_TOKEN_EXPIRE_MINUTES = 15      # Vote casting session
OTP_SESSION_EXPIRE_MINUTES = 10       # OTP verification session
RECONFIRMATION_WINDOW_MINUTES = 10    # Time window for sensitive actions


# =========================================================
# CREATE NORMAL ACCESS TOKEN (7 days)
# =========================================================

def create_access_token(
    data: dict,
    expires_delta: timedelta | None = None,
    device_fingerprint: str | None = None,
) -> str:
    """
    Create a standard platform access token.
    Default expiry: 7 days (platform-wide browsing, dashboard, navigation).
    Does NOT grant voting privileges.
    """
    to_encode = data.copy()

    expire = datetime.now(timezone.utc) + (
        expires_delta
        or timedelta(days=NORMAL_TOKEN_EXPIRE_DAYS)
    )

    payload = {
        "exp": expire,
        "type": TOKEN_TYPE_ACCESS,
        "token_type": "normal",
    }
    payload.update(to_encode)

    if device_fingerprint:
        payload["device_fp"] = device_fingerprint

    encoded_jwt = jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )

    return encoded_jwt


# =========================================================
# REISSUE TOKEN WITH RECONFIRMATION
# =========================================================

def reissue_with_reconfirmation(original_token: str) -> str:
    """
    Re-issue the existing access token with a reconfirmed_at timestamp.
    This preserves all original claims (sub, role, email, csrf_token, etc.)
    and extends the expiry back to the standard 7 days from now.
    The reconfirmed_at field enables the 10-minute sensitive-action window.
    """
    try:
        payload = decode_access_token(original_token)
    except Exception:
        raise ValueError("Invalid token for reconfirmation")

    # Recompute expiry
    expire = datetime.now(timezone.utc) + timedelta(days=NORMAL_TOKEN_EXPIRE_DAYS)

    new_payload = {k: v for k, v in payload.items() if k != "exp"}
    new_payload["exp"] = expire
    new_payload["type"] = TOKEN_TYPE_ACCESS
    new_payload["token_type"] = "normal"
    new_payload["reconfirmed_at"] = datetime.now(timezone.utc).isoformat()

    encoded_jwt = jwt.encode(
        new_payload,
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )

    return encoded_jwt


# =========================================================
# CREATE VOTING ACCESS TOKEN (15 minutes)
# =========================================================

def create_voting_access_token(
    voter_id: str,
    email: str,
    election_id: str,
    csrf_token: str,
    device_fingerprint: str | None = None,
) -> str:
    """
    Create a tightly-scoped voting token (15 min expiry).
    Valid ONLY for vote casting endpoints (verify-face, cast, etc.).
    Invalidated after successful vote submission.
    """
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=VOTING_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": voter_id,
        "role": "voter",
        "email": email,
        "election_id": election_id,
        "type": TOKEN_TYPE_VOTING,
        "token_type": "voting",
        "exp": expire,
        "csrf_token": csrf_token,
    }

    if device_fingerprint:
        payload["device_fp"] = device_fingerprint

    encoded_jwt = jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )

    return encoded_jwt


# =========================================================
# CREATE OTP SESSION TOKEN
# =========================================================

def create_otp_session_token(
    voter_id: str,
    email: str,
    otp_id: str,
    expires_in_minutes: int = OTP_SESSION_EXPIRE_MINUTES,
    **kwargs,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_in_minutes)

    payload = {
        "sub": voter_id,
        "email": email,
        "otp_id": otp_id,
        "type": TOKEN_TYPE_OTP_SESSION,
        "token_type": "otp_session",
        "exp": expire,
    }
    payload.update(kwargs)

    token = jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )

    return token


# =========================================================
# DECODE TOKEN
# =========================================================

def decode_access_token(token: str) -> dict:
    payload = jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=["HS256"],
    )
    return payload
