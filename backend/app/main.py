from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.metrics import router as metrics_router
from app.database.init_db import init_database
from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.ai_settings import router as ai_settings_router
from app.api.assistant import router as assistant_router
from app.api.intelligence import router as intelligence_router
from app.api.alerts import router as alerts_router
from app.api.telemetry import router as telemetry_router
from app.api.alert_rules import router as alert_rules_router
from app.api.incidents import router as incidents_router
from app.api.automations import router as automations_router
import asyncio
from app.services.forwarder import forward_spool_manager, get_forward_url
from app.services.ml.loader import ml_loader
from app.mcp.server import router as mcp_router


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

    if get_forward_url():
        print(f"Forwarding enabled to {get_forward_url()}. Flushing any spooled batches...", flush=True)
        asyncio.create_task(forward_spool_manager.flush())

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
        "http://localhost",
        "http://localhost:80",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:4173",
        "http://127.0.0.1",
        "http://127.0.0.1:80",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:4173",
        "https://server-intelligence-nine.vercel.app",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
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

app.include_router(
    alerts_router,
    prefix="/api",
)

app.include_router(
    telemetry_router,
    prefix="/api",
)
app.include_router(
    alert_rules_router,
    prefix="/api",
)
app.include_router(
    incidents_router,
    prefix="/api",
)
app.include_router(
    automations_router,
    prefix="/api",
)
app.include_router(
    mcp_router,
     prefix="/api"
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
