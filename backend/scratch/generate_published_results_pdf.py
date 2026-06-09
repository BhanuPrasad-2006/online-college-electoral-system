import asyncio
import uuid
import datetime
from datetime import timezone
from sqlalchemy import select, update
from sqlalchemy.orm import joinedload

from app.db.session import SessionLocal
from app.models.election import Election
from app.models.position import Position
from app.models.candidate import Candidate
from app.models.result_publication import ResultPublication
from app.models.admin_user import AdminUser
from app.services.result_service import ResultService
from app.security.integrity_service import IntegrityService
from app.services.pdf_service import PDFService
from app.services.supabase_storage import upload_election_results_pdf
from app.utils.logger import logger

async def main():
    async with SessionLocal() as db:
        # 1. Fetch current election
        res = await db.execute(select(Election).order_by(Election.created_at.desc()))
        election = res.scalars().first()
        if not election:
            print("No election found.")
            return

        print(f"Election ID: {election.election_id}, Title: {election.title}")

        # Check if ResultPublication already exists
        pub_res = await db.execute(select(ResultPublication).where(ResultPublication.election_id == election.election_id))
        pub = pub_res.scalar_one_or_none()
        if pub:
            print(f"ResultPublication already exists: {pub.pdf_url}")
            return

        # 2. Compute integrity hash snapshot
        integrity = IntegrityService()
        integrity_hash = await integrity.generate_result_hash(db, str(election.election_id))
        print(f"Computed Integrity Hash: {integrity_hash}")

        # 3. Determine and save winners (setting is_winner flag and winner_announced_at)
        result_service = ResultService(db)
        summaries = await result_service.determine_winners(str(election.election_id))
        
        winners_by_position = {}
        for summary in summaries:
            position_id = summary["position_id"]
            pos_res = await db.execute(select(Position).where(Position.position_id == uuid.UUID(position_id)))
            pos_obj = pos_res.scalar_one_or_none()
            pos_title = pos_obj.title if pos_obj else f"Position {position_id[:8]}"
            winners_by_position[pos_title] = []

            for cand_info in summary["candidates"]:
                cand_id = cand_info["candidate_id"]
                if cand_id and cand_id != "NOTA":
                    cand_uuid = uuid.UUID(cand_id)
                    winner_status = cand_info.get("winner_status")
                    is_winner = winner_status in ("WON", "TIE")
                    
                    await db.execute(
                        update(Candidate)
                        .where(Candidate.candidate_id == cand_uuid)
                        .values(
                            is_winner=is_winner,
                            winner_announced_at=datetime.datetime.now(timezone.utc) if is_winner else None
                        )
                    )
                    
                    if is_winner:
                        cand_res = await db.execute(
                            select(Candidate)
                            .options(joinedload(Candidate.voter))
                            .where(Candidate.candidate_id == cand_uuid)
                        )
                        cand_obj = cand_res.scalar_one_or_none()
                        cand_name = cand_obj.voter.full_name if cand_obj and cand_obj.voter else "Unknown Candidate"
                        winners_by_position[pos_title].append(cand_name)

        # 4. Format results for PDF
        raw_results = await result_service.compute_results(str(election.election_id))
        pdf_results = []
        
        position_ids = [uuid.UUID(pid) for pid in raw_results.keys()]
        position_map = {}
        if position_ids:
            pos_res = await db.execute(select(Position).where(Position.position_id.in_(position_ids)))
            position_map = {str(p.position_id): p for p in pos_res.scalars().all()}
            
        candidate_ids = []
        for tallies in raw_results.values():
            for entry in tallies:
                cid = entry["candidate_id"]
                if cid and cid != "NOTA":
                    candidate_ids.append(uuid.UUID(cid))
                    
        candidate_map = {}
        if candidate_ids:
            cand_res = await db.execute(
                select(Candidate)
                .options(joinedload(Candidate.voter))
                .where(Candidate.candidate_id.in_(candidate_ids))
            )
            candidate_map = {str(c.candidate_id): c for c in cand_res.scalars().unique().all()}

        for position_id, tallies in raw_results.items():
            position = position_map.get(position_id)
            position_title = position.title if position else f"Position {position_id[:8]}"
            total_pos_votes = sum(entry["vote_count"] for entry in tallies)
            
            candidates_data = []
            for entry in tallies:
                cand_id = entry["candidate_id"]
                name = "NOTA"
                is_winner = False
                if cand_id and cand_id != "NOTA":
                    candidate_obj = candidate_map.get(cand_id)
                    if candidate_obj and candidate_obj.voter:
                        name = candidate_obj.voter.full_name
                        is_winner = candidate_obj.is_winner
                percentage = round((entry["vote_count"] / total_pos_votes * 100), 2) if total_pos_votes > 0 else 0.0
                candidates_data.append({
                    "name": name,
                    "votes": entry["vote_count"],
                    "percentage": percentage,
                    "is_winner": is_winner
                })
            candidates_data.sort(key=lambda c: c["votes"], reverse=True)
            pdf_results.append({"position": position_title, "candidates": candidates_data})

        # Fetch Admin details
        admin_res = await db.execute(select(AdminUser).order_by(AdminUser.created_at.asc()))
        admin_user = admin_res.scalars().first()
        admin_uuid = admin_user.admin_id if admin_user else None
        admin_email = admin_user.email if admin_user else "admin@college.edu.in"

        # 5. Generate Results PDF
        publication_id = uuid.uuid4()
        college_name = "Online College Electoral System"
        election_year = str(election.voting_end.year) if election.voting_end else str(datetime.datetime.now().year)
        published_at_str = datetime.datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        
        pdf_buffer = PDFService.generate_election_results_pdf(
            college_name=college_name,
            election_name=election.title,
            election_year=election_year,
            election_id=str(election.election_id),
            publication_id=str(publication_id),
            published_by_email=admin_email,
            published_at_str=published_at_str,
            audit_hash=integrity_hash,
            results=pdf_results
        )
        
        print("Uploading PDF to Supabase...")
        uploaded_obj = await upload_election_results_pdf(
            election_id=str(election.election_id),
            filename=f"results_{election.election_id}.pdf",
            data=pdf_buffer.getvalue()
        )
        pdf_url = uploaded_obj.public_url
        print(f"Uploaded successfully: {pdf_url}")

        # 6. Save ResultPublication track record
        publication = ResultPublication(
            publication_id=publication_id,
            election_id=election.election_id,
            published_by=admin_uuid,
            published_at=datetime.datetime.now(timezone.utc),
            pdf_url=pdf_url,
            audit_hash=integrity_hash
        )
        db.add(publication)
        
        # update election result hash in DB
        election.result_integrity_hash = integrity_hash
        
        await db.commit()
        print("Successfully published PDF results for existing election.")

if __name__ == "__main__":
    asyncio.run(main())
