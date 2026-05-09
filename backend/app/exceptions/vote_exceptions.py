"""Vote exceptions — custom exceptions for voting flows."""

from fastapi import HTTPException, status


class AlreadyVotedError(HTTPException):
    def __init__(self, position: str = "this position"):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=f"You have already voted for {position}")


class ElectionNotActiveError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail="Election is not currently active")


class InvalidCandidateError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid candidate for this election/position")


class VoteIntegrityError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Vote integrity check failed")


class ReplayAttackError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail="Potential replay attack detected")


class HoneypotTriggeredError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail="Request rejected")
