"""Auth exceptions — custom exceptions for authentication flows."""

from fastapi import HTTPException, status


class InvalidCredentialsError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")


class AccountNotVerifiedError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail="Account not verified. Please verify your email.")


class AccountDeactivatedError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail="Account has been deactivated")


class OTPExpiredError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP has expired. Please request a new one.")


class OTPInvalidError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP code")


class OTPRateLimitError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many OTP attempts. Please try again later.")


class TokenExpiredError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
