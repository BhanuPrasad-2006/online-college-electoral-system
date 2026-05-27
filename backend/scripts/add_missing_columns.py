from app.core.config import settings
from sqlalchemy import create_engine, text


def main():
    url = settings.DATABASE_URL.replace("+asyncpg", "")
    print("Connecting to", url)
    engine = create_engine(url, future=True)
    with engine.begin() as conn:
        # Add eligible_department if missing
        conn.execute(text(
            "ALTER TABLE elections ADD COLUMN IF NOT EXISTS eligible_department VARCHAR(100)"
        ))
        print("Added eligible_department (if it didn't exist)")


if __name__ == '__main__':
    main()
