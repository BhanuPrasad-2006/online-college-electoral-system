from pydantic import BaseModel
from typing import Optional


class CandidateApplyRequest(BaseModel):
    election_id: str
    position: str
    statement: str


class CandidateResponse(BaseModel):
    id: str
    user_id: str
    election_id: str
    position: str
    status: str
    statement: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True
