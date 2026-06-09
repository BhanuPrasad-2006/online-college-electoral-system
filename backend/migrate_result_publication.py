import asyncio
from sqlalchemy import text, inspect
from app.db.session import engine


async def migrate():
    async with engine.begin() as conn:
        print("=" * 50)
        print("Running migration: create result_publications table")
        print("=" * 50)

        def create_table(connection):
            inspector = inspect(connection)
            existing_tables = inspector.get_table_names()
            if "result_publications" in existing_tables:
                print("  result_publications table already exists, skipping.")
                return

            uuid_type = "UUID" if connection.dialect.name == "postgresql" else "VARCHAR(36)"
            default_uuid = "DEFAULT gen_random_uuid()" if connection.dialect.name == "postgresql" else ""
            timestamptz_type = "TIMESTAMPTZ" if connection.dialect.name == "postgresql" else "DATETIME"
            now_func = "NOW()" if connection.dialect.name == "postgresql" else "CURRENT_TIMESTAMP"

            print("  Creating table result_publications...")
            connection.execute(text(f"""
                CREATE TABLE IF NOT EXISTS result_publications (
                    publication_id {uuid_type} PRIMARY KEY {default_uuid},
                    election_id {uuid_type} NOT NULL REFERENCES elections(election_id) ON DELETE CASCADE,
                    published_by {uuid_type} NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
                    published_at {timestamptz_type} DEFAULT {now_func} NOT NULL,
                    pdf_url VARCHAR(500) NOT NULL,
                    audit_hash VARCHAR(64) NOT NULL,
                    UNIQUE(election_id)
                );
            """))
            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_result_publications_election ON result_publications(election_id);"))
            print("  result_publications table created.")

        await conn.run_sync(create_table)
        print("=" * 50)
        print("Migration complete!")
        print("=" * 50)


if __name__ == "__main__":
    asyncio.run(migrate())
