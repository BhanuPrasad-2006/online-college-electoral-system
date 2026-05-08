# System Diagrams

## Entity Relationship Diagram

```
voters (1) ──── (N) candidates
voters (1) ──── (N) concerns
voters (1) ──── (N) otp_requests
voters (1) ──── (N) audit_logs
elections (1) ──── (N) candidates
elections (1) ──── (N) votes
elections (1) ──── (N) class_vote_stats
candidates (1) ──── (1) manifestos
candidates (1) ──── (N) votes
```

## Vote Flow

```
1. Student authenticates (JWT)
2. Student requests JIT token
3. Frontend verifies identity (OTP/TOTP)
4. Backend validates JIT token
5. Vote hash generated (candidate + position + timestamp + previous_hash)
6. Vote stored WITHOUT voter_id
7. Receipt hash generated and returned to voter
8. Voter marked as "has voted" in separate record
```
