# 🗳️ College Election System

A secure, AI-powered online voting platform for college elections — **face-verified voting with liveness anti-spoofing**, anonymous hash-chained ballots, real-time analytics, fraud detection and transparent governance.

![Face verification](https://img.shields.io/badge/Face%20verification-ArcFace-00ff9c?style=for-the-badge&labelColor=0a0e14)
![Liveness](https://img.shields.io/badge/Anti--spoofing-passive%20liveness-00e5ff?style=for-the-badge&labelColor=0a0e14)
![Ballots](https://img.shields.io/badge/Ballots-hash--chained-ff2e88?style=for-the-badge&labelColor=0a0e14)

## 🏗️ Architecture

| Service       | Technology           | Port  |
|---------------|----------------------|-------|
| Frontend      | React 19 + TanStack Start + Vite + Tailwind CSS | 3000  |
| Backend API   | FastAPI (Python) + DeepFace (ArcFace) + OpenCV | 8000  |
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

## 🧬 Face Verification (Biometric Voting)

Before a ballot can be cast, the voter has to prove they are the registered student — live, on camera.

```
webcam frames ──► liveness checks ──► ArcFace embeddings ──► majority match ──► one-time vote token
                  (is it a real          (512-d face           (≥ 60 % of frames     (single-use JTI,
                   live person?)          vectors)              match enrolment)      consumed on cast)
```

- **Face recognition** — DeepFace with the **ArcFace** model turns each frame into an embedding and compares it with the voter's enrolled photo by cosine similarity.
- **Majority-vote matching** — a burst of frames is checked, and at least 60 % must match, so a single lucky or blurry frame can't pass or fail a voter.
- **Passive liveness / anti-spoofing** — no blinking or head-turning needed. Frames are checked for real camera sensor noise, natural embedding drift, brightness flicker and identical frames, which rejects printed photos, screenshots and replayed images.
- **Replay protection** — every submitted frame is SHA-256 hashed; a frame that has been seen before is rejected.
- **Brute-force lockout** — failed face attempts lock the voter out with exponential backoff (15 min → 30 min → 1 h → 24 h), backed by Redis with a database fallback, and the endpoint is rate-limited.
- **One-time vote token** — a successful match issues a short-lived, single-use token that the cast-vote endpoint consumes, so verification and voting can't be separated or reused.

## 🔐 Security Features

- **Vote Anonymity** — No `voter_id` stored in vote records
- **Hash Chain Integrity** — Blockchain-inspired vote hash chains
- **JIT Verification** — Just-in-time face + identity verification immediately before voting
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
git clone https://github.com/BhanuPrasad-2006/online-college-electoral-system.git
cd online-college-electoral-system

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
online-college-electoral-system/
├── frontend/          # React 19 + TanStack Start + Vite
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