# 🗳️ College Election System

A secure, AI-powered online voting platform for college elections with real-time analytics, fraud detection, and transparent governance.

## 🏗️ Architecture

| Service       | Technology           | Port  |
|---------------|----------------------|-------|
| Frontend      | Next.js 14 + Tailwind CSS | 3000  |
| Backend API   | FastAPI (Python)     | 8000  |
| AI Service    | FastAPI + NLP/ML     | 8001  |
| Database      | PostgreSQL 16        | 5432  |
| Cache/Queue   | Redis 7              | 6379  |

## ✨ Features

### 🎓 Student Portal
- **Secure Voting** — OTP + JIT verification, anti-replay protection
- **Concern Submission** — Raise and track concerns with AI-powered categorization
- **AI Recommendations** — Smart candidate matching based on student concerns
- **Live Statistics** — Real-time election results and participation metrics

### 🏆 Candidate Portal
- **Manifesto Editor** — Rich text manifesto creation with AI analysis
- **Concern Reports** — View aggregated student concerns by category
- **Campaign Dashboard** — Track engagement and voter sentiment

### 🔧 Admin Panel
- **Election Control** — Start/stop/schedule elections with timer management
- **Fraud Detection** — AI-powered anomaly detection and alert system
- **Analytics Dashboard** — Comprehensive charts and voter demographics
- **Audit Logs** — Complete trail of all system actions
- **User Management** — Approve candidates, manage voters

## 🔐 Security Features

- **Vote Anonymity** — No `voter_id` stored in vote records
- **Hash Chain Integrity** — Blockchain-inspired vote hash chains
- **JIT Verification** — Just-in-time identity verification before voting
- **Anti-Replay** — Token-based replay attack prevention
- **Rate Limiting** — API rate limiting per user/IP
- **Audit Trail** — Comprehensive logging of all actions

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL 16
- Redis 7

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/college-election-system.git
cd college-election-system

# Copy environment files
cp .env.example backend/.env
cp .env.example ai_service/.env
cp .env.example frontend/.env.local

# Start all services
docker-compose up -d
```

### Manual Setup

#### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

#### AI Service
```bash
cd ai_service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 📁 Project Structure

```
college-election-system/
├── frontend/          # Next.js 14 + Tailwind CSS
├── backend/           # FastAPI Main Backend
├── ai_service/        # AI/NLP Microservice
├── db/                # Migrations, seeds, SQL functions
├── tests/             # Backend, frontend, AI tests
└── docs/              # Architecture, API docs, diagrams
```

## 🗄️ Database Migrations

```bash
cd db
alembic upgrade head
```

## 🧪 Testing

```bash
# Backend tests
cd tests/backend && pytest

# Frontend tests
cd tests/frontend && npm test

# AI service tests
cd tests/ai && pytest
```

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.