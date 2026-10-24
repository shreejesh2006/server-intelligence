import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    # Resolve root directory containing server_intelligence.db:
    # - Local dev: <repo_root>/backend/server_intelligence.db
    # - Docker container: /app/server_intelligence.db
    _resolved_file = Path(__file__).resolve()

    if len(_resolved_file.parents) > 2:
        BACKEND_DIR = _resolved_file.parents[2]
    else:
        BACKEND_DIR = _resolved_file.parents[1]

    DATABASE_PATH = BACKEND_DIR / "server_intelligence.db"

    # Fallback if file exists in parents[1] instead
    if (
        not DATABASE_PATH.exists()
        and (_resolved_file.parents[1] / "server_intelligence.db").exists()
    ):
        DATABASE_PATH = _resolved_file.parents[1] / "server_intelligence.db"

    DATABASE_URL = f"sqlite:///{DATABASE_PATH}"
else:
    # 1. Normalize legacy postgres:// (Render / Heroku) to standard postgresql://
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

    # 2. Dynamic driver negotiation between psycopg (v3) and psycopg2
    if DATABASE_URL.startswith("postgresql+psycopg://"):
        try:
            import psycopg  # noqa: F401
        except ImportError:
            try:
                import psycopg2  # noqa: F401
                DATABASE_URL = DATABASE_URL.replace("postgresql+psycopg://", "postgresql+psycopg2://", 1)
            except ImportError:
                pass
    elif DATABASE_URL.startswith("postgresql+psycopg2://"):
        try:
            import psycopg2  # noqa: F401
        except ImportError:
            try:
                import psycopg  # noqa: F401
                DATABASE_URL = DATABASE_URL.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)
            except ImportError:
                pass
    elif DATABASE_URL.startswith("postgresql://"):
        try:
            import psycopg2  # noqa: F401
        except ImportError:
            try:
                import psycopg  # noqa: F401
                DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
            except ImportError:
                pass


class Base(DeclarativeBase):
    pass


engine_kwargs = {}

if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {
        "check_same_thread": False,
    }
else:
    # Cloud PostgreSQL (Supabase / Render): ping connections and recycle to survive pooler drops
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 300

engine = create_engine(
    DATABASE_URL,
    **engine_kwargs,
)


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()
