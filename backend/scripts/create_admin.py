import getpass
import sys
from pathlib import Path


# Add the backend directory to Python's import path so this script
# can be executed directly with:
#
#     python scripts/create_admin.py
#
BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


from sqlalchemy import select

from app.auth.security import hash_password
from app.database.database import SessionLocal
from app.database.init_db import init_database
from app.database.models import User, UserRole


def main():
    init_database()

    username = input("Admin username: ").strip()

    if len(username) < 3:
        print("Username must contain at least 3 characters.")
        sys.exit(1)

    password = getpass.getpass("Admin password: ")
    confirm_password = getpass.getpass("Confirm password: ")

    if len(password) < 8:
        print("Password must contain at least 8 characters.")
        sys.exit(1)

    if password != confirm_password:
        print("Passwords do not match.")
        sys.exit(1)

    with SessionLocal() as db:
        existing_user = db.scalar(
            select(User).where(User.username == username)
        )

        if existing_user:
            print(f"User '{username}' already exists.")
            sys.exit(1)

        user = User(
            username=username,
            password_hash=hash_password(password),
            role=UserRole.ADMIN.value,
            is_active=True,
        )

        db.add(user)
        db.commit()
        db.refresh(user)

        print()
        print("Administrator created successfully.")
        print(f"ID: {user.id}")
        print(f"Username: {user.username}")
        print(f"Role: {user.role}")


if __name__ == "__main__":
    main()
