from fastapi import APIRouter, Depends
from app.core.security import get_current_user

router = APIRouter()


@router.get("/")
async def list_concerns(page: int = 1, page_size: int = 20):
    """List all concerns with pagination."""
    # TODO: Implement concern listing
    return {"message": "Concerns list endpoint"}


@router.post("/")
async def create_concern(current_user=Depends(get_current_user)):
    """Create a new concern."""
    # TODO: Implement concern creation with AI classification
    return {"message": "Create concern endpoint"}


@router.post("/upvote/{concern_id}")
async def upvote_concern(concern_id: str, current_user=Depends(get_current_user)):
    """Upvote a concern."""
    # TODO: Implement upvoting
    return {"message": f"Upvote concern {concern_id}"}


@router.get("/report")
async def get_concern_report(current_user=Depends(get_current_user)):
    """Get aggregated concern report by category."""
    # TODO: Implement concern report
    return {"message": "Concern report endpoint"}
