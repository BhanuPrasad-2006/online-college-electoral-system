from fastapi import FastAPI
from src.api.routes import router

app = FastAPI(
    title="College Election AI Service",
    description="AI/NLP microservice for concern classification, manifesto analysis, and fraud detection",
    version="1.0.0",
)

app.include_router(router, prefix="/api")


@app.get("/")
async def root():
    return {"status": "healthy", "service": "AI Service", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}
