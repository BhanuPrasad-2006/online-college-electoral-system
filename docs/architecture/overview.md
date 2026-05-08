# Architecture Documentation

## System Overview

The College Election System follows a microservices architecture with three main services:

### Services
1. **Frontend** — Next.js 14 + Tailwind CSS SPA
2. **Backend API** — FastAPI (Python) REST API
3. **AI Service** — FastAPI microservice for NLP/ML

### Infrastructure
- **PostgreSQL 16** — Primary database
- **Redis 7** — Caching, session store, rate limiting, anti-replay tokens
- **Docker** — Containerized deployment

## Data Flow

```
Student → Frontend → Backend API → PostgreSQL
                  ↘ AI Service ↗     ↕ Redis
```

## Security Architecture

- JWT-based authentication with refresh tokens
- Vote anonymity — no voter_id in vote records
- Hash chain integrity for vote verification
- JIT verification before voting
- Anti-replay tokens (one-time use)
- Rate limiting per user/IP
- Complete audit trail
