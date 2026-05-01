from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .routers import auth, trainers, programs, admin
from .socket_manager import sio

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(
    title="Trainer Portal API",
    description="API for trainer management portal with admin and user interfaces",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3003",
        "http://127.0.0.1:3003",
        "http://localhost:3004",
        "http://127.0.0.1:3004",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IO integration
app.mount("/socket.io", sio)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])
app.include_router(trainers.router, prefix="/api/trainers", tags=["trainers"])
app.include_router(programs.router, prefix="/api/programs", tags=["programs"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])

@app.get("/")
async def root():
    return {"message": "Trainer Portal API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}
