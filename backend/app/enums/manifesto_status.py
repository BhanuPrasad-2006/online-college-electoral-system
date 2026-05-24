import enum


class ManifestoStatusEnum(str, enum.Enum):
  DRAFT = "draft"
  PENDING = "pending"
  APPROVED = "approved"
  REJECTED = "rejected"
