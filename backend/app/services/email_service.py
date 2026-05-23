import smtplib
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from functools import partial

from app.core.config import settings
from app.utils.logger import logger


def _build_otp_email(recipient_name: str, otp: str, purpose: str = "login") -> MIMEMultipart:
    """Build the OTP email HTML content."""
    subject_map = {
        "login": "Your Login OTP - College Election Portal",
        "registration": "Verify Your Email - College Election Portal",
        "password_reset": "Password Reset OTP - College Election Portal",
    }
    subject = subject_map.get(purpose, "Your OTP - College Election Portal")

    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 24px;">
        <div style="background: #1e40af; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
            <h2 style="color: white; margin: 0;">🗳️ College Election Portal</h2>
        </div>
        <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
            <p style="color: #374151; font-size: 16px;">Hi <strong>{recipient_name}</strong>,</p>
            <p style="color: #374151;">Your one-time password (OTP) for <strong>{purpose}</strong> is:</p>
            <div style="background: #1e40af; color: white; font-size: 36px; font-weight: bold;
                        letter-spacing: 10px; text-align: center; padding: 20px; border-radius: 8px;
                        margin: 20px 0;">
                {otp}
            </div>
            <p style="color: #6b7280; font-size: 14px;">
                ⏱ This OTP is valid for <strong>{settings.OTP_EXPIRE_MINUTES} minutes</strong>.
            </p>
            <p style="color: #6b7280; font-size: 14px;">
                🔒 Never share this OTP with anyone. Our team will never ask for it.
            </p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                If you didn't request this, please ignore this email.
            </p>
        </div>
    </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"College Election Portal <{settings.GMAIL_SENDER_EMAIL}>"
    msg["To"] = ""  # set dynamically
    msg.attach(MIMEText(html_body, "html"))
    return msg


def _send_email_sync(to_email: str, subject_override: str, html_content: str) -> bool:
    """Synchronous Gmail SMTP send. Runs in thread pool."""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject_override
        msg["From"] = f"College Election Portal <{settings.GMAIL_SENDER_EMAIL}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(settings.GMAIL_SENDER_EMAIL, settings.GMAIL_APP_PASSWORD)
            server.sendmail(settings.GMAIL_SENDER_EMAIL, to_email, msg.as_string())

        logger.info(f"Email sent to {to_email}")
        return True

    except smtplib.SMTPAuthenticationError:
        logger.error("Gmail authentication failed. Check GMAIL_APP_PASSWORD in .env")
        return False
    except smtplib.SMTPException as e:
        logger.error(f"SMTP error sending to {to_email}: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected email error: {e}")
        return False


async def send_otp_email(
    to_email: str,
    recipient_name: str,
    otp: str,
    purpose: str = "login",
) -> bool:
    """
    Send OTP via Gmail SMTP.
    Runs sync SMTP in thread pool to avoid blocking the event loop.
    """
    logger.info(f"[EMAIL] [DEV MODE] Email OTP for {to_email} ({purpose}): {otp}")
    try:
        import os
        otp_log_path = os.path.join(os.getcwd(), "latest_otp.txt")
        with open(otp_log_path, "w", encoding="utf-8") as f:
            f.write(f"{to_email}:{otp}")
    except Exception as e:
        logger.error(f"Failed to write latest_otp.txt: {e}")

    subject_map = {
        "login": "Your Login OTP - College Election Portal",
        "registration": "Verify Your Email - College Election Portal",
        "password_reset": "Password Reset OTP - College Election Portal",
    }
    subject = subject_map.get(purpose, "Your OTP - College Election Portal")

    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 24px;">
        <div style="background: #1e40af; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
            <h2 style="color: white; margin: 0;">🗳️ College Election Portal</h2>
        </div>
        <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
            <p style="color: #374151; font-size: 16px;">Hi <strong>{recipient_name}</strong>,</p>
            <p style="color: #374151;">Your one-time password (OTP) for <strong>{purpose}</strong> is:</p>
            <div style="background: #1e40af; color: white; font-size: 36px; font-weight: bold;
                        letter-spacing: 10px; text-align: center; padding: 20px; border-radius: 8px;
                        margin: 20px 0;">
                {otp}
            </div>
            <p style="color: #6b7280; font-size: 14px;">
                ⏱ This OTP is valid for <strong>{settings.OTP_EXPIRE_MINUTES} minutes</strong>.
            </p>
            <p style="color: #6b7280; font-size: 14px;">
                🔒 Never share this OTP with anyone.
            </p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                If you didn't request this, please ignore this email.
            </p>
        </div>
    </body>
    </html>
    """

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        partial(_send_email_sync, to_email, subject, html_body),
    )


async def send_election_email(
    to_email: str,
    recipient_name: str,
    subject: str,
    html_body: str,
) -> bool:
    """
    Send general election notification email via Gmail SMTP.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        partial(_send_email_sync, to_email, subject, html_body),
    )