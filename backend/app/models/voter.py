import uuid

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
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

    # Current (admin-approved) reference image and face encoding
    reference_image_url = Column(String(500), nullable=True)

    face_encoding = Column(Text, nullable=True)

    # Pending voter-submitted photo (awaiting admin approval)
    pending_image_url = Column(String(500), nullable=True)

    pending_face_encoding = Column(Text, nullable=True)

    # Previous photo retained for security / audit trail
    previous_image_url = Column(String(500), nullable=True)

    previous_face_encoding = Column(Text, nullable=True)

    # Number of times voter has submitted a photo re-upload request (max 2)
    photo_reupload_count = Column(Integer, default=0, nullable=False)

    # Admin has requested the voter to re-upload their photo
    photo_reupload_requested = Column(Boolean, default=False, nullable=False)

    failed_attempts = Column(Integer, default=0, nullable=False)

    lockout_until = Column(DateTime(timezone=True), nullable=True, index=True)

    embedding_model_version = Column(String(50), nullable=True, index=True)

    failed_face_attempts = Column(Integer, default=0, nullable=False, index=True)

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
