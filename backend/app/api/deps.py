"""API dependencies — shared dependency injection for route handlers."""

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

import jwt

from app.db.session import get_db
from app.security.jwt_service import decode_access_token
from app.security.device_fingerprint import generate_fingerprint, validate_fingerprint
from app.models.voter import Voter
from app.enums.roles import UserRoleEnum

from sqlalchemy import select


security_scheme = HTTPBearer()


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Extract and validate the current user from JWT token."""
    from app.models.blacklisted_token import BlacklistedToken
    stmt = select(BlacklistedToken).where(BlacklistedToken.token == credentials.credentials)
    result = await db.execute(stmt)
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
        )

    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    user_id = payload.get("sub")
    role = payload.get("role")

    if not user_id or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    # Optional double-submit CSRF verification for state-changing HTTP requests.
    # The CSRF token is only validated if the frontend actually sends the X-CSRF-Token header.
    # Since the `Authorization` header (Bearer token) is a custom header that browsers do not
    # automatically attach across origins, it already provides CSRF protection.
    # If the header is absent, we skip the check to avoid breaking clients that were
    # issued before CSRF was fully plumbed on the frontend.
    if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        actual_csrf = request.headers.get("x-csrf-token")
        if actual_csrf is not None:
            expected_csrf = payload.get("csrf_token")
            if not expected_csrf or expected_csrf != actual_csrf:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="CSRF token validation failed",
                )

    # Device fingerprint validation (token-to-device binding)
    token_fp = payload.get("device_fp")
    validate_fingerprint(request, token_fp)

    return {"user_id": user_id, "role": role, "email": payload.get("email")}


async def get_admin_user(current_user: dict = Depends(get_current_user)) -> dict:
    """Ensure the current user has admin role."""
    if current_user["role"] != UserRoleEnum.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


async def get_candidate_user(current_user: dict = Depends(get_current_user)) -> dict:
    """Ensure the current user has candidate or admin role."""
    if current_user["role"] not in (UserRoleEnum.CANDIDATE, UserRoleEnum.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Candidate access required",
        )
    return current_user


async def get_voter_user(current_user: dict = Depends(get_current_user)) -> dict:
    """Ensure the current user has voter role."""
    if current_user["role"] != UserRoleEnum.VOTER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Voter access required",
        )
    return current_user
