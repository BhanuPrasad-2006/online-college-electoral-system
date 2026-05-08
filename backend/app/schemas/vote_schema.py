from pydantic import BaseModel
from typing import Optional


class VoteSubmitRequest(BaseModel):
    election_id: str
    candidate_id: str
    position: str
    jit_token: str


class VoteReceiptResponse(BaseModel):
    receipt_hash: str
    timestamp: str
    position: str


class VoteVerifyRequest(BaseModel):
    receipt_hash: str


class VoteVerifyResponse(BaseModel):
    valid: bool
    message: Optional[str] = None
