from sqlalchemy import select
from app.auth.security import hash_password
from app.database.database import Base, SessionLocal, engine
from app.database.models import User, UserRole


def init_database():
    Base.metadata.create_all(bind=engine)
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
