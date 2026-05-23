from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings


# =========================================================
# CREATE ACCESS TOKEN
# =========================================================

def create_access_token(
    data: dict,
    expires_delta: timedelta | None = None,
    device_fingerprint: str | None = None,
) -> str:

    to_encode = data.copy()

    expire = datetime.now(timezone.utc) + (
        expires_delta
        or timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    )

    payload = {
        "exp": expire,
        "type": "access",
    }
    payload.update(to_encode)

    # Attach device fingerprint if provided
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
    expires_in_minutes: int = 10,
    **kwargs,
) -> str:

    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_in_minutes)

    payload = {
        "sub": voter_id,
        "email": email,
        "otp_id": otp_id,
        "type": "otp_session",
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
