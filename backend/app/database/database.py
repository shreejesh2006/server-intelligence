import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    # Resolve root directory containing server_intelligence.db:
    # - Local dev: <repo_root>/backend/server_intelligence.db (parents[2] of backend/app/database/database.py)
    # - Docker container: /app/server_intelligence.db (parents[2] of /app/app/database/database.py)
    _resolved_file = Path(__file__).resolve()
    if len(_resolved_file.parents) > 2:
        BACKEND_DIR = _resolved_file.parents[2]
    else:
        BACKEND_DIR = _resolved_file.parents[1]

    DATABASE_PATH = BACKEND_DIR / "server_intelligence.db"

    # Fallback if file exists in parents[1] instead
    if not DATABASE_PATH.exists() and (_resolved_file.parents[1] / "server_intelligence.db").exists():
        DATABASE_PATH = _resolved_file.parents[1] / "server_intelligence.db"

    DATABASE_URL = f"sqlite:///{DATABASE_PATH}"



class Base(DeclarativeBase):
    pass


engine = create_engine(
    DATABASE_URL,
    connect_args={
        "check_same_thread": False,
    },
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
