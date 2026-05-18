class AuthException(Exception):

    def __init__(
        self,
        message: str = "Authentication error"
    ):
        self.message = message
        super().__init__(self.message)


class InvalidCredentialsError(AuthException):

    def __init__(
        self,
        message: str = "Invalid credentials"
    ):
        super().__init__(message)


class AccountDisabledError(AuthException):

    def __init__(
        self,
        message: str = "Account is disabled"
    ):
        super().__init__(message)


class AccountNotVerifiedError(AuthException):

    def __init__(
        self,
        message: str = "Account is not verified"
    ):
        super().__init__(message)


class OTPError(AuthException):

    def __init__(
        self,
        message: str = "Invalid OTP"
    ):
        super().__init__(message)


class OTPSessionExpiredError(AuthException):

    def __init__(
        self,
        message: str = "OTP session expired"
    ):
        super().__init__(message)


class MobileEmailMismatchError(AuthException):

    def __init__(
        self,
        message: str = "Mobile number does not match"
    ):
        super().__init__(message)


class CandidateRejectedError(AuthException):

    def __init__(
        self,
        message: str = "Candidate registration was rejected by admin",
        remarks: str = ""
    ):
        self.remarks = remarks
        super().__init__(message)


class CandidateEligibilityError(AuthException):

    def __init__(
        self,
        message: str = "First and second-year students are not eligible to contest elections."
    ):
        super().__init__(message)