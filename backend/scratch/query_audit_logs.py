import asyncio
from sqlalchemy import text
from app.db.session import engine

async def query_audit_logs():
    async with engine.connect() as conn:
        print("Querying audit logs for voter 1ds24cy015@dsce.edu.in...")
        # Get voter_id
        res = await conn.execute(text(
            "SELECT voter_id, full_name FROM voters WHERE college_email = '1ds24cy015@dsce.edu.in'"
        ))
        voter = res.fetchone()
        if not voter:
            print("Voter not found.")
            return
        
        voter_id = voter[0]
        print(f"Voter ID: {voter_id}, Name: {voter[1]}")
        
        res_logs = await conn.execute(text(
            "SELECT event_type, description, ip_address, created_at FROM audit_logs WHERE actor_id = :voter_id ORDER BY created_at DESC LIMIT 20"
        ), {"voter_id": voter_id})
        
        logs = res_logs.fetchall()
        print(f"Found {len(logs)} audit logs:")
        for log in logs:
            print(f"[{log[3]}] {log[0]}: {log[1]} (IP: {log[2]})")

asyncio.run(query_audit_logs())
