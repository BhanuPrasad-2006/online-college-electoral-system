import os
import time
from collections import defaultdict
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse

from src.api.routes import router

app = FastAPI(
    title="College Election AI Service",
    description="AI/NLP microservice for concern classification, manifesto analysis, and fraud detection",
    version="1.0.0",
)

# 1. CORS Hardening (strict CORS)
app_env = os.getenv("APP_ENV", "development")
backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")

origins = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    backend_url,
]

if app_env == "development":
    origins.extend([
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173"
    ])

# Remove duplicates
origins = list(set(origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "X-API-Key"],
)

# 2. Security Headers Middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'none'; "
            "style-src 'none'; "
            "img-src 'self' data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )
        return response

app.add_middleware(SecurityHeadersMiddleware)

# 3. Request Size Limiter Middleware (10MB max)
class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_size_bytes: int = 10 * 1024 * 1024):
        super().__init__(app)
        self.max_size_bytes = max_size_bytes

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self.max_size_bytes:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "Payload Too Large. Maximum allowed size is 10MB."}
                    )
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={"detail": "Invalid Content-Length header."}
                )
        return await call_next(request)

app.add_middleware(RequestSizeLimitMiddleware)

# 4. In-Memory Rate Limiter Middleware (60 requests per minute per IP)
class RateLimitingMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, limit: int = 60, window_seconds: int = 60):
        super().__init__(app)
        self.limit = limit
        self.window_seconds = window_seconds
        self.requests = defaultdict(list)

    def get_client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
        return request.client.host if request.client else "127.0.0.1"

    async def dispatch(self, request: Request, call_next):
        # Allow health checks without rate limiting
        if request.url.path in ["/health", "/", "/api/health"]:
            return await call_next(request)
            
        client_ip = self.get_client_ip(request)
        now = time.time()
        
        # Prune expired requests
        self.requests[client_ip] = [t for t in self.requests[client_ip] if now - t < self.window_seconds]
        
        if len(self.requests[client_ip]) >= self.limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again later."}
            )
            
        self.requests[client_ip].append(now)
        return await call_next(request)

app.add_middleware(RateLimitingMiddleware)

app.include_router(router, prefix="/api")

@app.get("/")
async def root():
    return {"status": "healthy", "service": "AI Service", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}
