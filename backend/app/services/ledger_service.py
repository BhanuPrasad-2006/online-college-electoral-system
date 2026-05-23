import logging
import os
import json
import hashlib
import asyncio
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Base path for the secure, append-only vault file
VAULT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "vault")
VAULT_PATH = os.path.join(VAULT_DIR, "secure_vote_ledger.log")

async def calculate_vote_hash(candidate_id: str | None, timestamp_utc: str, election_id: str, previous_hash: str | None, ledger_sequence: int) -> str:
    """
    Generate SHA256(election_id + candidate_id + timestamp_utc + ledger_sequence + previous_hash)
    to protect chain integrity.
    """
    cand_str = str(candidate_id or "")
    prev_str = str(previous_hash or "")
    payload = f"{election_id}{cand_str}{timestamp_utc}{ledger_sequence}{prev_str}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def append_to_secure_vault(vote_data: dict, current_hash: str):
    """
    Append vote record in JSON Lines format to a secure, write-once-read-many (WORM)
    file in append-only mode.
    
    Does NOT store voter identity to preserve complete vote anonymity.
    """
    def _write():
        os.makedirs(VAULT_DIR, exist_ok=True)
        # Ensure only anonymous fields are written
        payload = {
            "sequence": vote_data.get("ledger_sequence"),
            "election_id": vote_data.get("election_id"),
            "position_id": vote_data.get("position_id"),
            "candidate_id": vote_data.get("candidate_id"),
            "timestamp": vote_data.get("timestamp_utc"),
            "hash": current_hash
        }
        with open(VAULT_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")
            
    await asyncio.to_thread(_write)


async def verify_ledger_integrity(db_session) -> dict:
    """
    Cryptographic verification engine.
    Iterates through all votes in the DB, recalculates hashes,
    checks the chain sequence, and cross-references with the secure vault.
    
    Returns:
        dict containing: status (valid/invalid), tampered_entries list, missing_entries list, hash_mismatches list
    """
    from sqlalchemy import select
    from app.models.vote import Vote
    
    logger.info("Starting ledger integrity verification...")
    
    # 1. Fetch all votes from DB sorted by ledger_sequence
    query = select(Vote).order_by(Vote.ledger_sequence.asc())
    result = await db_session.execute(query)
    db_votes = result.scalars().all()
    
    # 2. Read all entries from vault file
    vault_entries = []
    if os.path.exists(VAULT_PATH):
        try:
            def _read():
                entries = []
                with open(VAULT_PATH, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            entries.append(json.loads(line))
                return entries
            vault_entries = await asyncio.to_thread(_read)
        except Exception as e:
            logger.error(f"Error reading secure vault file: {e}")
            
    # Build maps for easy lookup
    db_by_seq = {v.ledger_sequence: v for v in db_votes if v.ledger_sequence is not None}
    vault_by_seq = {v["sequence"]: v for v in vault_entries}
    
    tampered_entries = []
    missing_entries = []
    hash_mismatches = []
    
    # Determine the union of all sequence numbers
    all_seqs = set(db_by_seq.keys()).union(set(vault_by_seq.keys()))
    sorted_seqs = sorted(list(all_seqs))
    
    for seq in sorted_seqs:
        db_vote = db_by_seq.get(seq)
        vault_entry = vault_by_seq.get(seq)
        
        # Check if deleted (in vault but not in DB)
        if vault_entry and not db_vote:
            missing_entries.append({
                "sequence": seq,
                "election_id": vault_entry.get("election_id"),
                "candidate_id": vault_entry.get("candidate_id"),
                "hash": vault_entry.get("hash"),
                "reason": "Vote exists in secure vault but is missing from database (deleted)"
            })
            continue
            
        # Check if in DB but not in vault (unauthorized insertion)
        if db_vote and not vault_entry:
            tampered_entries.append({
                "sequence": seq,
                "vote_id": db_vote.vote_id,
                "reason": "Vote exists in database but is missing from secure vault (unauthorized insert)"
            })
            continue
            
        # If in both, compare and recalculate hashes
        if db_vote and vault_entry:
            if db_vote.timestamp_utc:
                dt = db_vote.timestamp_utc
                if dt.tzinfo is not None:
                    dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
                timestamp_str = dt.isoformat()
            else:
                timestamp_str = ""
            
            recalculated = await calculate_vote_hash(
                candidate_id=db_vote.candidate_id,
                timestamp_utc=timestamp_str,
                election_id=db_vote.election_id,
                previous_hash=db_vote.previous_hash,
                ledger_sequence=db_vote.ledger_sequence
            )
            
            # Check if DB current_hash matches recalculated
            if db_vote.current_hash != recalculated:
                hash_mismatches.append({
                    "sequence": seq,
                    "vote_id": db_vote.vote_id,
                    "stored_hash": db_vote.current_hash,
                    "recalculated_hash": recalculated,
                    "reason": "Database vote current_hash mismatch with recalculated hash"
                })
                
            # Check if vault hash matches DB current_hash
            if vault_entry.get("hash") != db_vote.current_hash:
                tampered_entries.append({
                    "sequence": seq,
                    "vote_id": db_vote.vote_id,
                    "reason": "Database vote hash does not match the secure vault hash"
                })
                
            # Check if candidate_id matches
            db_cand = str(db_vote.candidate_id) if db_vote.candidate_id else None
            vault_cand = str(vault_entry.get("candidate_id")) if vault_entry.get("candidate_id") else None
            if db_cand != vault_cand:
                tampered_entries.append({
                    "sequence": seq,
                    "vote_id": db_vote.vote_id,
                    "reason": "Database candidate_id does not match the secure vault candidate_id"
                })
                
            # Check chain continuity
            if seq > 1:
                prev_vote = db_by_seq.get(seq - 1)
                if prev_vote:
                    if db_vote.previous_hash != prev_vote.current_hash:
                        tampered_entries.append({
                            "sequence": seq,
                            "vote_id": db_vote.vote_id,
                            "reason": f"Chain broken: previous_hash does not match sequence {seq-1} current_hash"
                        })
                else:
                    tampered_entries.append({
                        "sequence": seq,
                        "vote_id": db_vote.vote_id,
                        "reason": f"Chain broken: preceding vote sequence {seq-1} is missing"
                    })
            else:
                # First vote in chain
                if db_vote.previous_hash is not None and db_vote.previous_hash != "":
                    tampered_entries.append({
                        "sequence": seq,
                        "vote_id": db_vote.vote_id,
                        "reason": "First vote in chain has non-null previous_hash"
                    })
                    
    is_valid = len(tampered_entries) == 0 and len(missing_entries) == 0 and len(hash_mismatches) == 0
    
    return {
        "valid": is_valid,
        "tampered_entries": tampered_entries,
        "missing_entries": missing_entries,
        "hash_mismatches": hash_mismatches
    }
