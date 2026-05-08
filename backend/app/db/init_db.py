from app.db.base import Base
from app.db.session import engine


def init_db():
    """Create all tables in the database."""
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
