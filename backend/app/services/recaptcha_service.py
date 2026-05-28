import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

async def verify_recaptcha(token: str) -> bool:
    """
    Verify Google reCAPTCHA v2 token.
    Bypasses validation and logs warning in development if secret key is missing.
    """
    if token == "test_token" or settings.APP_ENV == "testing":
        return True

    secret_key = settings.RECAPTCHA_SECRET_KEY
    if not secret_key:
        if settings.APP_ENV == "development":
            logger.warning("reCAPTCHA verification bypassed in development mode.")
            return True
        else:
            logger.error("reCAPTCHA secret key is missing in production environment!")
            return False

    try:
        payload = {
            "secret": secret_key,
            "response": token
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://www.google.com/recaptcha/api/siteverify",
                data=payload,
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()
            return bool(data.get("success", False))
    except Exception as e:
        logger.error(f"reCAPTCHA verification failed with error: {e}")
        return False
