from app.database.database import Base, engine

# Import models so SQLAlchemy registers their tables.
from app.database import models  # noqa: F401


def init_database():
    Base.metadata.create_all(bind=engine)
