from sqlalchemy.orm import Session

from app.database.models import Incident


def get_all_incidents(db: Session):
    return (
        db.query(Incident)
        .order_by(Incident.created_at.desc())
        .all()
    )