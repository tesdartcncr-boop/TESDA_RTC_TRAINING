from contextlib import asynccontextmanager
from pathlib import Path
import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from socketio import ASGIApp

try:
    from .routers import auth, trainers, programs, admin, schedules, messages, signatures
    from .socket_manager import sio
except ImportError:
    project_root = Path(__file__).resolve().parents[1]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    from backend.routers import auth, trainers, programs, admin, schedules, messages, signatures
    from backend.socket_manager import sio

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

fastapi_app = FastAPI(
    title="Trainer Portal API",
    description="API for trainer management portal with admin and user interfaces",
    version="1.0.0",
    lifespan=lifespan
)

DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://localhost:3004",
    "http://localhost:3005",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:3003",
    "http://127.0.0.1:3004",
    "http://127.0.0.1:3005",
]


def get_cors_origins():
    raw_origins = os.getenv("CORS_ORIGINS", "")
    configured = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    origins = list(dict.fromkeys(DEFAULT_CORS_ORIGINS + configured))
    return origins


# CORS configuration
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IO integration
app = ASGIApp(sio, other_asgi_app=fastapi_app)

# Include routers
fastapi_app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])
fastapi_app.include_router(trainers.router, prefix="/api/trainers", tags=["trainers"])
fastapi_app.include_router(programs.router, prefix="/api/programs", tags=["programs"])
fastapi_app.include_router(schedules.router, prefix="/api/schedules", tags=["schedules"])
fastapi_app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
fastapi_app.include_router(messages.router, prefix="/api/messages", tags=["messaging"])
fastapi_app.include_router(messages.admin_router, tags=["messaging"])
fastapi_app.include_router(signatures.router, prefix="/api/signatures", tags=["signatures"])

@fastapi_app.get("/")
async def root():
    return {"message": "Trainer Portal API is running"}

@fastapi_app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}


@fastapi_app.get("/tesda-icon.png")
async def tesda_icon():
    icon_path = Path(__file__).resolve().parent / "tesda_icon.png"
    return FileResponse(icon_path)
