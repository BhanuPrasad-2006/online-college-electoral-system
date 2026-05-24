import asyncio
import uuid
import traceback
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.config import settings
from app.models.candidate import Candidate
from app.models.concern import Concern
from app.models.manifesto import Manifesto
from app.services.ai_proxy_service import AIProxyService

async def main():
    candidate_id_str = "c1e5356c-ce7e-486b-abd2-c8bd6bab4642"
    user_uuid = uuid.UUID(candidate_id_str)
    
    import ssl
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    
    url = settings.DATABASE_URL.replace("aws-1-ap-southeast-1.pooler.supabase.com", "13.213.241.248")
    engine = create_async_engine(
        url,
        connect_args={
            "prepared_statement_cache_size": 0,
            "statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4().hex}__",
            "ssl": ssl_context
        }
    )
    Session = async_sessionmaker(bind=engine)
    
    async with Session() as db:
        try:
            # 1. Fetch Candidate
            query = (
                select(Candidate)
                .options(
                    joinedload(Candidate.voter),
                    joinedload(Candidate.position)
                )
                .where(Candidate.candidate_id == user_uuid)
            )
            res = await db.execute(query)
            candidate = res.scalar_one_or_none()
            
            if not candidate:
                query = (
                    select(Candidate)
                    .options(
                        joinedload(Candidate.voter),
                        joinedload(Candidate.position)
                    )
                    .where(Candidate.voter_id == user_uuid)
                )
                res = await db.execute(query)
                candidate = res.scalar_one_or_none()
                
            if not candidate:
                print("Candidate not found!")
                return

            print(f"Fetched candidate: {candidate.candidate_id}, Election: {candidate.election_id}")

            # 2. Fetch concerns
            print("Fetching concerns...")
            from sqlalchemy import cast
            from sqlalchemy.dialects.postgresql import UUID as PgUUID
            concerns_query = select(Concern).where(cast(Concern.election_id, PgUUID) == candidate.election_id)
            concerns_res = await db.execute(concerns_query)
            concerns = concerns_res.scalars().all()
            print(f"Fetched {len(concerns)} concerns.")

            if not concerns:
                print("No concerns found. Returning empty list.")
                return []

            # 3. Group concerns by category
            from collections import defaultdict
            category_groups = defaultdict(list)
            for concern in concerns:
                cat_val = concern.category.value if hasattr(concern.category, "value") else concern.category
                if cat_val:
                    category_groups[cat_val].append(concern)

            # Define display names mapping
            DISPLAY_NAMES = {
                "academic": "Academic",
                "infrastructure": "Infrastructure",
                "campus_life": "Campus Life",
                "administration": "Administration",
                "other": "Other"
            }

            # Prepare category details
            categories_to_analyze = []
            category_data = []

            for cat_val, category_concerns in category_groups.items():
                display_name = DISPLAY_NAMES.get(cat_val.lower(), cat_val.replace("_", " ").title())
                categories_to_analyze.append(display_name)
                
                total_cnt = len(category_concerns)
                pos_cnt = 0
                neg_cnt = 0
                neu_cnt = 0
                for c in category_concerns:
                    s_val = c.sentiment.value if hasattr(c.sentiment, "value") else c.sentiment
                    if s_val == "positive":
                        pos_cnt += 1
                    elif s_val == "negative":
                        neg_cnt += 1
                    else:
                        neu_cnt += 1
                        
                pos_pct = round((pos_cnt / total_cnt) * 100) if total_cnt > 0 else 0
                neu_pct = round((neu_cnt / total_cnt) * 100) if total_cnt > 0 else 0
                neg_pct = 100 - pos_pct - neu_pct if total_cnt > 0 else 0
                
                category_data.append({
                    "name": display_name,
                    "mentions": total_cnt,
                    "positive": pos_pct,
                    "neutral": neu_pct,
                    "negative": neg_pct,
                    "covered": False  # default, updated after AI analysis
                })

            # Fetch candidate's manifesto
            print("Fetching manifesto...")
            manifesto_query = select(Manifesto).where(Manifesto.candidate_id == candidate.candidate_id)
            manifesto_res = await db.execute(manifesto_query)
            manifesto_record = manifesto_res.scalars().first()
            manifesto_content = manifesto_record.content if manifesto_record else ""
            print("Fetched manifesto content.")

            # Call AI service for gap analysis if we have categories
            if categories_to_analyze:
                print("Calling AI service for gap analysis...")
                ai_proxy = AIProxyService()
                gap_response = await ai_proxy.analyze_gaps(manifesto_content, categories_to_analyze)
                coverages = gap_response.get("coverages", [])
                coverages_map = {item["category_name"].lower(): item["covered"] for item in coverages if isinstance(item, dict)}
                
                # Update covered field in category_data
                for cat in category_data:
                    cat["covered"] = coverages_map.get(cat["name"].lower(), False)
                    
            print(f"Success! Result: {category_data}")

        except Exception as e:
            print("ERROR:")
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
