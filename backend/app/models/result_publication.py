import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base

class ResultPublication(Base):
    __tablename__ = "result_publications"

    publication_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    election_id = Column(UUID(as_uuid=True), ForeignKey("elections.election_id", ondelete="CASCADE"), nullable=False, unique=True)
    published_by = Column(UUID(as_uuid=True), ForeignKey("admin_users.admin_id", ondelete="CASCADE"), nullable=False)
    published_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    pdf_url = Column(String(500), nullable=False)
    audit_hash = Column(String(64), nullable=False)

    # Relationships
    election = relationship("Election")
    publisher = relationship("AdminUser")

    def __repr__(self):
        return f"<ResultPublication election_id={self.election_id} published_at={self.published_at}>"
