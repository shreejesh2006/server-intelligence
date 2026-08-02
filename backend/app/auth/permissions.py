from collections.abc import Callable

from fastapi import Depends, HTTPException, status

from app.auth.dependencies import get_current_user
from app.database.models import User, UserRole


def require_roles(
    *allowed_roles: UserRole,
) -> Callable:
    allowed_values = {
        role.value for role in allowed_roles
    }

    def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role not in allowed_values:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        return current_user

    return role_checker


require_admin = require_roles(
    UserRole.ADMIN,
)

require_operator = require_roles(
    UserRole.ADMIN,
    UserRole.OPERATOR,
)

require_viewer = require_roles(
    UserRole.ADMIN,
    UserRole.OPERATOR,
    UserRole.VIEWER,
)
