import uuid

from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class Voter(Base):
    __tablename__ = "voters"

    voter_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Hashed 8-character verification ID printed on the voter's card.
    verification_id = Column(String(255), nullable=True, index=True)

    student_id = Column(String(50), unique=True, nullable=True, index=True)

    full_name = Column(String(255), nullable=False)

    college_email = Column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )

    password_hash = Column(String(255), nullable=False)

    department = Column(String(100), nullable=True)

    year_of_study = Column(Integer, nullable=True)

    is_verified = Column(Boolean, default=False)

    has_voted = Column(Boolean, default=False)

    vote_permission = Column(Boolean, default=False)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    mobile_number = Column(String(15), nullable=True)

    candidate_profile = relationship(
        "Candidate",
        back_populates="voter",
        uselist=False,
    )

    @property
    def verification_code(self):
        return None

    @property
    def voter_code(self):
        return "Configured" if self.verification_id else None

    def __repr__(self):
        return f"<Voter {self.college_email}>"
