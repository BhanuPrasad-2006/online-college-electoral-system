import httpx
from app.core.config import settings
from app.utils.logger import logger


FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2"


async def send_otp_sms(mobile_number: str, otp: str, recipient_name: str = "") -> bool:
    """
    Send OTP via Fast2SMS (Indian SMS gateway).
    Uses DLT-compliant Quick Transactional route.
    
    mobile_number: 10-digit Indian mobile number (without +91)
    """
    # Strip country code if present
    mobile = mobile_number.replace("+91", "").replace(" ", "").strip()
    if len(mobile) != 10 or not mobile.isdigit():
        logger.error(f"Invalid mobile number format: {mobile_number}")
        return False

    # Development fallback
    if settings.APP_ENV == "development":
        logger.info(f"[SMS] [DEV MODE] SMS OTP for {mobile}: {otp}")
        try:
            import os
            otp_log_path = os.path.join(os.getcwd(), "latest_sms_otp.txt")
            with open(otp_log_path, "w", encoding="utf-8") as f:
                f.write(f"{mobile}:{otp}")
        except Exception as e:
            logger.error(f"Failed to write latest_sms_otp.txt: {e}")
    else:
        logger.info(f"SMS OTP generated for {mobile[-4:].rjust(10, '*')}")

    message = (
        f"Dear {recipient_name}, your OTP for College Election Portal login is "
        f"{otp}. Valid for {settings.OTP_EXPIRE_MINUTES} minutes. "
        f"Do not share with anyone. -ELCVOT"
    )

    headers = {
        "authorization": settings.FAST2SMS_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "route": "q",          # Quick Transactional route
        "message": message,
        "language": "english",
        "flash": 0,
        "numbers": mobile,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(FAST2SMS_URL, json=payload, headers=headers)
            data = response.json()

            if response.status_code == 200 and data.get("return") is True:
                logger.info(f"SMS sent to {mobile[-4:].rjust(10, '*')}")
                return True
            else:
                logger.error(f"Fast2SMS error: {data.get('message', 'Unknown error')}")
                return False

    except httpx.TimeoutException:
        logger.error(f"Fast2SMS request timed out for {mobile[-4:].rjust(10, '*')}")
        return False
    except httpx.HTTPError as e:
        logger.error(f"Fast2SMS HTTP error: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected SMS error: {e}")
        return False


async def send_custom_sms(mobile_number: str, message: str) -> bool:
    """
    Send a custom alert/notification SMS to a 10-digit Indian mobile number.
    """
    # Strip country code if present
    mobile = mobile_number.replace("+91", "").replace(" ", "").strip()
    if len(mobile) != 10 or not mobile.isdigit():
        logger.error(f"Invalid mobile number format: {mobile_number}")
        return False

    logger.info(f"[SMS] [DEV MODE] Custom SMS Alert for {mobile}: '{message}'")

    headers = {
        "authorization": settings.FAST2SMS_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "route": "q",          # Quick Transactional route
        "message": message,
        "language": "english",
        "flash": 0,
        "numbers": mobile,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(FAST2SMS_URL, json=payload, headers=headers)
            data = response.json()

            if response.status_code == 200 and data.get("return") is True:
                logger.info(f"Custom SMS sent to {mobile[-4:].rjust(10, '*')}")
                return True
            else:
                logger.error(f"Fast2SMS error: {data.get('message', 'Unknown error')}")
                return False

    except httpx.TimeoutException:
        logger.error(f"Fast2SMS custom request timed out for {mobile[-4:].rjust(10, '*')}")
        return False
    except httpx.HTTPError as e:
        logger.error(f"Fast2SMS custom HTTP error: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected custom SMS error: {e}")
        return False