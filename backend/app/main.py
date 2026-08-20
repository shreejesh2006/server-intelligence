from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.metrics import router as metrics_router
from app.database.init_db import init_database
from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.ai_settings import router as ai_settings_router
from app.api.assistant import router as assistant_router
from app.api.intelligence import router as intelligence_router
from app.services.ml.loader import ml_loader


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("=== SERVER INTELLIGENCE STARTUP ===")

    init_database()

    print("Loading ML artifacts...")
    ml_loader.load_all()

    print(
        "ML STATUS:",
        "forecast=", ml_loader.is_forecast_available(),
        "anomaly=", ml_loader.is_anomaly_available(),
        "forecast_metadata=", len(ml_loader.forecasting_metadata),
        "forecast_models=", len(ml_loader.forecasting_models),
    )

    yield


app = FastAPI(
    title="Server Intelligence API",
    description=(
        "Backend API for the Server Intelligence Platform"
    ),
    version="0.2.0",
    lifespan=lifespan,
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

app.include_router(
    auth_router,
    prefix="/api",
)

app.include_router(
    users_router,
    prefix="/api",
)

app.include_router(
    ai_settings_router,
    prefix="/api",
)

app.include_router(
    assistant_router,
    prefix="/api",
)

app.include_router(
    intelligence_router,
    prefix="/api",
)


@app.get("/")
async def root():
    return {
        "name": "Server Intelligence API",
        "version": "0.2.0",
        "status": "running",
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
    }
