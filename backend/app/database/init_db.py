from sqlalchemy import select, text
from app.auth.security import hash_password
from app.database.database import Base, SessionLocal, engine
from app.database.models import User, UserRole


def init_database():
    Base.metadata.create_all(bind=engine)

    # Safe migration for SQLite: ensure any newly added columns exist on tables
    try:
        with engine.connect() as conn:
            result = conn.execute(text("PRAGMA table_info(notifications)"))
            existing_cols = {row[1] for row in result.fetchall()}
            if existing_cols:
                if "status" not in existing_cols:
                    conn.execute(text("ALTER TABLE notifications ADD COLUMN status VARCHAR(20) DEFAULT 'CREATED' NOT NULL"))
                if "delivered_at" not in existing_cols:
                    conn.execute(text("ALTER TABLE notifications ADD COLUMN delivered_at DATETIME"))
                if "error" not in existing_cols:
                    conn.execute(text("ALTER TABLE notifications ADD COLUMN error VARCHAR(500)"))
                conn.commit()
    except Exception:
        pass

    with SessionLocal() as db:
        admin_user = db.scalar(select(User).where(User.username == "admin"))
        if not admin_user:
            admin_user = User(
                username="admin",
                password_hash=hash_password("adminpassword"),
                role=UserRole.ADMIN.value,
                is_active=True,
            )
            db.add(admin_user)
            db.commit()
