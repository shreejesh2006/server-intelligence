from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.metrics import router as metrics_router


app = FastAPI(
    title="Server Intelligence API",
    description=(
        "Backend API for the Server Intelligence Platform"
    ),
    version="0.1.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(
    metrics_router,
    prefix="/api",
)


@app.get("/")
async def root():
    return {
        "name": "Server Intelligence API",
        "version": "0.1.0",
        "status": "running",
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
    }
