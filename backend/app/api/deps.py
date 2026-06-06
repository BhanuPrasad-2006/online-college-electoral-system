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
from app.utils.logger import logger


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
    # ── CSRF Token Validation ────────────────────────────────
    # Backward-compatible: only validate if BOTH the JWT has a csrf_token
    # AND the client sends one. Old tokens without the claim are allowed
    # through to avoid breaking existing sessions.
    if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        actual_csrf = request.headers.get("x-csrf-token")
        expected_csrf = payload.get("csrf_token")
        if actual_csrf is not None and expected_csrf is not None:
            if expected_csrf != actual_csrf:
                logger.warning(
                    f"CSRF_MISMATCH "
                    f"route={request.url.path} "
                    f"method={request.method} "
                    f"expected_token={expected_csrf[:12]}... "
                    f"received_token={actual_csrf[:12]}... "
                    f"role={payload.get('role')} "
                    f"token_type={payload.get('token_type')} "
                    f"sub={payload.get('sub', '')[:8]}..."
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="CSRF token validation failed",
                )
        elif actual_csrf is None:
            # No CSRF header sent — this is fine for backward compat
            logger.info(
                f"CSRF_SKIPPED route={request.url.path} method={request.method} "
                f"role={payload.get('role')} token_type={payload.get('token_type')}"
            )
        elif expected_csrf is None:
            # Old JWT without csrf_token claim — skip check for backward compat
            logger.info(
                f"CSRF_SKIPPED_OLD_TOKEN route={request.url.path} method={request.method} "
                f"role={payload.get('role')}"
            )

    # Device fingerprint validation (token-to-device binding)
    token_fp = payload.get("device_fp")
    validate_fingerprint(request, token_fp)

    return {
        "user_id": user_id,
        "role": role,
        "email": payload.get("email"),
        "admin_role": payload.get("admin_role"),
    }


async def get_admin_user(current_user: dict = Depends(get_current_user)) -> dict:
    """Ensure the current user has admin role."""
    if current_user["role"] != UserRoleEnum.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


class require_admin_roles:
    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] != UserRoleEnum.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required",
            )
        admin_role = current_user.get("admin_role")
        if admin_role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Role unauthorized for this resource",
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


# =========================================================
# VOTING SESSION DEPENDENCY
# =========================================================

async def get_voting_session(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Validate a voting-specific JWT token.
    Only tokens with token_type="voting" are accepted.
    Normal platform access tokens are REJECTED for voting endpoints.
    """
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
            detail="Voting token has expired. Please request a new one.",
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid voting token",
        )

    # CRITICAL: Only accept voting tokens for vote casting endpoints
    token_type = payload.get("token_type")
    if token_type != "voting":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A voting-specific token is required. Use /auth/voting-token to obtain one.",
        )

    # Also validate the type field
    if payload.get("type") != "voting":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid voting token type.",
        )

    voter_id = payload.get("sub")
    role = payload.get("role")
    election_id = payload.get("election_id")

    if not voter_id or role != UserRoleEnum.VOTER:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid voting token payload",
        )

    return {
        "user_id": voter_id,
        "role": role,
        "email": payload.get("email"),
        "election_id": election_id,
        "csrf_token": payload.get("csrf_token"),
    }


# =========================================================
# SENSITIVE ACTION RECONFIRMATION DEPENDENCY
# =========================================================

from datetime import datetime, timezone

async def require_reconfirmation(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Ensure the current token has been reconfirmed within the last 10 minutes.
    This guards sensitive actions (publish results, delete election, modify manifesto, etc.).
    """
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
            detail="Session expired",
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    # Check reconfirmation timestamp
    reconfirmed_at_str = payload.get("reconfirmed_at")
    if not reconfirmed_at_str:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password reconfirmation required. Please reconfirm your password first.",
        )

    try:
        reconfirmed_at = datetime.fromisoformat(reconfirmed_at_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid reconfirmation timestamp.",
        )

    # Ensure reconfirmed_at has timezone info
    if reconfirmed_at.tzinfo is None:
        reconfirmed_at = reconfirmed_at.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    elapsed_minutes = (now - reconfirmed_at).total_seconds() / 60

    if elapsed_minutes > 10:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Reconfirmation window expired. Please reconfirm your password again.",
        )

    user_id = payload.get("sub")
    role = payload.get("role")

    return {
        "user_id": user_id,
        "role": role,
        "email": payload.get("email"),
        "admin_role": payload.get("admin_role"),
        "reconfirmed_at": reconfirmed_at_str,
    }
