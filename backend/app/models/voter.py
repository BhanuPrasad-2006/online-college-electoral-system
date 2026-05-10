from sqlalchemy import Column, String, Text, Boolean, SmallInteger, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.db.base import Base


class Voter(Base):
    __tablename__ = "voters"

    voter_id      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id    = Column(String(20), unique=True, nullable=False)
    full_name     = Column(String(100), nullable=False)
    college_email = Column(String(150), unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    department    = Column(String(80))
    year_of_study = Column(SmallInteger)
    is_verified   = Column(Boolean, default=False)   # email OTP verified
    has_voted     = Column(Boolean, default=False)   # one-vote enforcement
    created_at    = Column(TIMESTAMP(timezone=True))
    mobile_number = Column(String(15))

    # relationships
    candidate_profile = relationship("Candidate", back_populates="voter", uselist=False)
    concerns          = relationship("Concern", back_populates="student")