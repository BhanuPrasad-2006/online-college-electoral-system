from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class ElectionCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime


class ElectionResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    status: str
    start_time: str
    end_time: str
    created_at: str

    model_config = ConfigDict(from_attributes=True)


class ElectionUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[str] = None


class ElectionSaveRequest(BaseModel):
    title: str
    registration_start: Optional[datetime] = None
    registration_end: Optional[datetime] = None
    document_deadline: Optional[datetime] = None
    voting_start: Optional[datetime] = None
    voting_end: Optional[datetime] = None
    eligible_department: Optional[str] = None

