import asyncio
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

async def main():
    from app.db.session import SessionLocal
    from sqlalchemy import select, func, case, text
    from app.models.voter import Voter

    async with SessionLocal() as db:
        # Calculate dept stats using text grouping to avoid SA grouping issue
        query = select(
            func.coalesce(Voter.department, "Unknown").label("department"),
            func.count(Voter.voter_id).label("total_voters"),
            func.sum(case((Voter.has_voted == True, 1), else_=0)).label("voted")
        ).group_by(func.coalesce(Voter.department, "Unknown"))

        # Alternate grouping that works with PostgreSQL
        query2 = select(
            func.coalesce(Voter.department, "Unknown").label("department"),
            func.count(Voter.voter_id).label("total_voters"),
            func.sum(case((Voter.has_voted == True, 1), else_=0)).label("voted")
        ).group_by(Voter.department)

        result = await db.execute(query2)
        stats = []
        for row in result.all():
            total = row.total_voters
            voted = row.voted or 0
            not_voted = total - voted
            turnout = (voted / total * 100) if total > 0 else 0
            
            stats.append({
                "department": row.department,
                "total_voters": total,
                "voted": voted,
                "not_voted": not_voted,
                "turnout_percentage": round(turnout, 1)
            })
            
        print(stats)

if __name__ == "__main__":
    asyncio.run(main())
