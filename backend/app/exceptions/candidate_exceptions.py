"""Candidate exceptions — custom exceptions for candidate flows."""

from fastapi import HTTPException, status


class CandidateNotFoundError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")


class DuplicateApplicationError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail="You have already applied for this election")


class ApplicationDeadlinePassedError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail="Application deadline has passed")


class ManifestoRequiredError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail="Manifesto is required for candidate approval")


class MobileNotVerifiedError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail="Mobile number must be verified before approval")
