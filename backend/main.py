from contextlib import asynccontextmanager
from pathlib import Path
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from socketio import ASGIApp

try:
    from .routers import auth, trainers, programs, admin, schedules, messages
    from .socket_manager import sio
except ImportError:
    project_root = Path(__file__).resolve().parents[1]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    from backend.routers import auth, trainers, programs, admin, schedules, messages
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

# CORS configuration
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
    ],
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

@fastapi_app.get("/")
async def root():
    return {"message": "Trainer Portal API is running"}

@fastapi_app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}
