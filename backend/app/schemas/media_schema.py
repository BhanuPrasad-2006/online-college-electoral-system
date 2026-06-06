from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime

class MediaCreateRequest(BaseModel):
    type: str = Field(..., description="'video', 'poster', or 'message'")
    title: str = Field(..., max_length=255)
    external_url: Optional[str] = Field(None, max_length=500)
    body: Optional[str] = Field(None, description="Campaign text message body")

class MediaStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="APPROVED or REJECTED")
    rejection_reason: Optional[str] = Field(None, max_length=500)

class MediaResponse(BaseModel):
    id: str
    candidateId: str
    candidateName: str
    party: str
    type: str
    title: str
    uploadedFileUrl: Optional[str] = None
    externalUrl: Optional[str] = None
    body: Optional[str] = None
    status: str
    submittedAt: str
    reviewedBy: Optional[str] = None
    reviewedAt: Optional[str] = None
    rejectionReason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
