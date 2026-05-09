from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import auth, vote, candidates, ai
from app.database import engine, Base

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Online College Electoral System",
    description="API for the Online College Electoral System",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(vote.router, prefix="/api/vote", tags=["Vote"])
app.include_router(candidates.router, prefix="/api/candidates", tags=["Candidates"])
app.include_router(ai.router, prefix="/api/ai", tags=["AI"])


@app.get("/")
def root():
    return {"message": "Online College Electoral System API is running."}
