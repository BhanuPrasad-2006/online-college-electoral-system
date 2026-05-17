from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings


# =========================================================
# CREATE ACCESS TOKEN
# =========================================================

def create_access_token(
    data: dict,
    expires_delta: timedelta | None = None,
) -> str:

    to_encode = data.copy()

    expire = datetime.now(timezone.utc) + (
        expires_delta
        or timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    )

    to_encode.update({
        "exp": expire,
        "type": "access",
    })

    encoded_jwt = jwt.encode(
        to_encode,
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
) -> str:

    expire = datetime.now(timezone.utc) + timedelta(minutes=10)

    payload = {
        "sub": voter_id,
        "email": email,
        "otp_id": otp_id,
        "type": "otp_session",
        "exp": expire,
    }

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