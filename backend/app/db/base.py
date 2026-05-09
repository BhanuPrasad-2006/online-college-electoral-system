from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# Import ALL models here so SQLAlchemy registers them.
# Alembic and init_db.py both need this file to see every table.
# Order matters — no circular imports.

from app.models.admin_user import AdminUser      # noqa: F401
from app.models.voter      import Voter          # noqa: F401
from app.models.election   import Election       # noqa: F401
from app.models.position   import Position       # noqa: F401
from app.models.candidate  import Candidate      # noqa: F401
from app.models.manifesto  import Manifesto      # noqa: F401
from app.models.vote       import Vote           # noqa: F401
from app.models.concern    import Concern        # noqa: F401
from app.models.otp_request import OTPRequest    # noqa: F401
from app.models.audit_log  import AuditLog       # noqa: F401
from app.models.ai_report  import AIReport       # noqa: F401
from app.models.ai_alert   import AIAlert        # noqa: F401
from app.models.vote_stats import VoteStats      # noqa: F401