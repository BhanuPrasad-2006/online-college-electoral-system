"""Party management routes — full CRUD for candidate party system."""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

from app.db.session import get_db
from app.api.deps import get_current_user, get_candidate_user, get_admin_user
from app.models.party import Party
from app.models.party_member import PartyMember
from app.models.party_invitation import PartyInvitation
from app.models.candidate import Candidate
from app.models.voter import Voter
from app.models.election import Election
from app.models.position import Position
from app.enums.party_status import PartyStatusEnum
from app.enums.invitation_status import InvitationStatusEnum
from app.enums.candidate_status import CandidateStatusEnum
from app.services.phase_engine import PhaseEngine
from app.utils.logger import logger

router = APIRouter()


# ── Request Models ─────────────────────────────────────────────

class PartyCreateRequest(BaseModel):
    party_name: str
    party_symbol: Optional[str] = None
    party_slogan: Optional[str] = None
    party_manifesto: Optional[str] = None
    logo_url: Optional[str] = None
    position_id: str
    otp_session_token: Optional[str] = None
    new_password: Optional[str] = None
    full_name: Optional[str] = None
    department: Optional[str] = None
    student_id: Optional[str] = None


class PartyManifestoUpdate(BaseModel):
    manifesto: str


class InviteRequest(BaseModel):
    invited_usn: Optional[str] = None
    invited_email: str
    role: str = "MEMBER"
    position: Optional[str] = None
    message: Optional[str] = None


class PartyStatusUpdate(BaseModel):
    status: str
    admin_remarks: Optional[str] = None


# ── Helper ─────────────────────────────────────────────────────

async def _get_candidate_from_user(user: dict, db: AsyncSession) -> Candidate:
    """Resolve logged-in candidate user → Candidate ORM row."""
    voter_id = uuid.UUID(user["user_id"])
    result = await db.execute(
        select(Candidate)
        .options(joinedload(Candidate.voter))
        .where(Candidate.voter_id == voter_id)
    )
    candidate = result.scalars().first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate profile not found.")
    return candidate


async def _get_latest_election(db: AsyncSession) -> Election:
    result = await db.execute(select(Election).order_by(Election.created_at.desc()))
    election = result.scalars().first()
    if not election:
        raise HTTPException(status_code=404, detail="No active election found.")
    return election


def _serialize_party(party: Party, members: list, invitations: list = None) -> dict:
    """Return a JSON-safe dict for a party."""
    return {
        "party_id": str(party.party_id),
        "election_id": str(party.election_id),
        "position_id": str(party.position_id) if party.position_id else None,
        "leader_candidate_id": str(party.leader_candidate_id) if party.leader_candidate_id else None,
        "name": party.name,
        "symbol": party.symbol,
        "slogan": party.slogan,
        "manifesto": party.manifesto,
        "logo_url": party.logo_url,
        "status": party.status,
        "admin_remarks": party.admin_remarks,
        "created_at": party.created_at.isoformat() if party.created_at else None,
        "updated_at": party.updated_at.isoformat() if party.updated_at else None,
        "members": members,
        "pending_invitations": invitations or [],
    }


# ── Candidate Routes ───────────────────────────────────────────

@router.post("/create", status_code=status.HTTP_201_CREATED)
async def create_party(
    body: PartyCreateRequest,
    current_user: dict = Depends(get_candidate_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new party and set the creator as party leader.

    The candidate must be APPROVED and not already in a party.
    Registration must be open.
    """
    candidate = await _get_candidate_from_user(current_user, db)
    election = await _get_latest_election(db)

    # Phase guard — allow party creation during registration phases only
    phase = PhaseEngine.get_current_phase(election)
    if phase not in ("registration_open", "registration_closed", "campaign_period"):
        raise HTTPException(
            status_code=400,
            detail=f"Party creation is only allowed during registration. Current phase: {phase}",
        )

    if candidate.status != CandidateStatusEnum.APPROVED.value:
        raise HTTPException(status_code=400, detail="Only approved candidates can create a party.")

    if candidate.party_id:
        raise HTTPException(status_code=400, detail="You are already a member of a party.")

    # Check duplicate party name
    dup = await db.execute(select(Party).where(Party.name == body.party_name.strip()))
    if dup.scalars().first():
        raise HTTPException(status_code=409, detail="A party with this name already exists.")

    # Validate position
    try:
        position_uuid = uuid.UUID(body.position_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid position_id format.")

    pos_res = await db.execute(select(Position).where(Position.position_id == position_uuid))
    position = pos_res.scalars().first()
    if not position:
        raise HTTPException(status_code=404, detail="Position not found.")

    party = Party(
        election_id=election.election_id,
        position_id=position_uuid,
        leader_candidate_id=candidate.candidate_id,
        name=body.party_name.strip(),
        symbol=body.party_symbol,
        slogan=body.party_slogan,
        manifesto=body.party_manifesto,
        logo_url=body.logo_url,
        status=PartyStatusEnum.PENDING.value,
    )
    db.add(party)
    await db.flush()  # get party_id

    # Assign party to candidate
    candidate.party_id = party.party_id
    candidate.candidate_type = "PARTY"
    candidate.party_role = "LEADER"

    # Create PartyMember record
    member = PartyMember(
        party_id=party.party_id,
        candidate_id=candidate.candidate_id,
        role="LEADER",
        position=str(position.title) if position else None,
    )
    db.add(member)
    party.leader_candidate_id = candidate.candidate_id

    await db.commit()
    await db.refresh(party)

    logger.info(f"Party created: {party.name} by candidate {candidate.candidate_id}")
    return {
        "message": "Party created successfully. Awaiting admin approval.",
        "party_id": str(party.party_id),
        "candidate_id": str(candidate.candidate_id),
        "status": party.status,
    }


@router.get("/me")
async def get_my_party(
    current_user: dict = Depends(get_candidate_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the logged-in candidate's party details."""
    candidate = await _get_candidate_from_user(current_user, db)

    if not candidate.party_id:
        raise HTTPException(status_code=404, detail="No party found. You are not in a party.")

    result = await db.execute(
        select(Party)
        .options(
            selectinload(Party.members),
            selectinload(Party.invitations),
        )
        .where(Party.party_id == candidate.party_id)
    )
    party = result.scalars().first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found.")

    # Enrich members with voter names
    members_data = []
    for m in party.members:
        # Load the candidate + voter for each member
        cand_res = await db.execute(
            select(Candidate)
            .options(joinedload(Candidate.voter))
            .where(Candidate.candidate_id == m.candidate_id)
        )
        cand = cand_res.scalars().first()
        members_data.append({
            "candidate_id": str(m.candidate_id),
            "full_name": cand.voter.full_name if cand and cand.voter else "Unknown",
            "department": cand.voter.department if cand and cand.voter else None,
            "role": m.role,
            "position": m.position,
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
            "is_leader": str(m.candidate_id) == str(party.leader_candidate_id),
        })

    invitations_data = [
        {
            "invitation_id": str(inv.invitation_id),
            "invited_voter_id": str(inv.invited_voter_id),
            "role": inv.role,
            "status": inv.status,
            "message": inv.message,
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
            "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
        }
        for inv in party.invitations
        if inv.status == InvitationStatusEnum.PENDING.value
    ]

    return _serialize_party(party, members_data, invitations_data)


@router.put("/me/manifesto")
async def update_party_manifesto(
    body: PartyManifestoUpdate,
    current_user: dict = Depends(get_candidate_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the party manifesto. Only the party leader can do this."""
    candidate = await _get_candidate_from_user(current_user, db)

    if not candidate.party_id:
        raise HTTPException(status_code=404, detail="You are not in a party.")

    result = await db.execute(select(Party).where(Party.party_id == candidate.party_id))
    party = result.scalars().first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found.")

    if str(party.leader_candidate_id) != str(candidate.candidate_id):
        raise HTTPException(status_code=403, detail="Only the party leader can update the manifesto.")

    party.manifesto = body.manifesto
    party.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Party manifesto updated successfully."}


@router.post("/me/invite")
async def send_party_invitation(
    body: InviteRequest,
    current_user: dict = Depends(get_candidate_user),
    db: AsyncSession = Depends(get_db),
):
    """Invite a voter to join the party as a candidate member."""
    candidate = await _get_candidate_from_user(current_user, db)

    if not candidate.party_id:
        raise HTTPException(status_code=400, detail="You must be in a party to send invitations.")

    result = await db.execute(select(Party).where(Party.party_id == candidate.party_id))
    party = result.scalars().first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found.")

    if str(party.leader_candidate_id) != str(candidate.candidate_id):
        raise HTTPException(status_code=403, detail="Only the party leader can send invitations.")

    # Find the voter by email
    voter_result = await db.execute(
        select(Voter).where(Voter.college_email == body.invited_email.strip().lower())
    )
    voter = voter_result.scalars().first()
    if not voter:
        raise HTTPException(status_code=404, detail="Voter with this email not found.")

    # Ensure voter is not already a candidate or in a party
    existing_candidate = await db.execute(
        select(Candidate).where(Candidate.voter_id == voter.voter_id)
    )
    if existing_candidate.scalars().first():
        raise HTTPException(status_code=409, detail="This voter is already a registered candidate.")

    # Check for existing pending invitation
    existing_invite = await db.execute(
        select(PartyInvitation).where(
            PartyInvitation.party_id == party.party_id,
            PartyInvitation.invited_voter_id == voter.voter_id,
            PartyInvitation.status == InvitationStatusEnum.PENDING.value,
        )
    )
    if existing_invite.scalars().first():
        raise HTTPException(status_code=409, detail="A pending invitation already exists for this voter.")

    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    invitation = PartyInvitation(
        party_id=party.party_id,
        invited_voter_id=voter.voter_id,
        invited_by_candidate_id=candidate.candidate_id,
        role=body.role or "MEMBER",
        position=body.position,
        message=body.message,
        status=InvitationStatusEnum.PENDING.value,
        expires_at=expires_at,
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)

    logger.info(f"Party invitation sent: party={party.party_id} → voter={voter.voter_id}")
    return {
        "message": "Invitation sent successfully.",
        "invitation_id": str(invitation.invitation_id),
        "expires_at": expires_at.isoformat(),
    }


@router.delete("/me/invite/{invitation_id}")
async def cancel_party_invitation(
    invitation_id: str,
    current_user: dict = Depends(get_candidate_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a pending party invitation."""
    candidate = await _get_candidate_from_user(current_user, db)

    try:
        inv_uuid = uuid.UUID(invitation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invitation_id.")

    result = await db.execute(
        select(PartyInvitation).where(PartyInvitation.invitation_id == inv_uuid)
    )
    invitation = result.scalars().first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found.")

    if str(invitation.party_id) != str(candidate.party_id):
        raise HTTPException(status_code=403, detail="You can only cancel your own party's invitations.")

    invitation.status = InvitationStatusEnum.CANCELLED.value
    invitation.responded_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Invitation cancelled."}


@router.get("/public/{party_id}")
async def get_public_party(
    party_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get public info about a party (visible to all authenticated users)."""
    try:
        party_uuid = uuid.UUID(party_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid party_id.")

    result = await db.execute(
        select(Party)
        .options(selectinload(Party.members))
        .where(Party.party_id == party_uuid)
    )
    party = result.scalars().first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found.")

    members_data = []
    for m in party.members:
        cand_res = await db.execute(
            select(Candidate)
            .options(joinedload(Candidate.voter))
            .where(Candidate.candidate_id == m.candidate_id)
        )
        cand = cand_res.scalars().first()
        members_data.append({
            "candidate_id": str(m.candidate_id),
            "full_name": cand.voter.full_name if cand and cand.voter else "Unknown",
            "department": cand.voter.department if cand and cand.voter else None,
            "role": m.role,
            "position": m.position,
            "is_leader": str(m.candidate_id) == str(party.leader_candidate_id),
        })

    return _serialize_party(party, members_data)


# ── Admin Routes ───────────────────────────────────────────────

@router.get("/admin/list")
async def admin_list_parties(
    status_filter: Optional[str] = None,
    admin: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List all parties with optional status filter. Admin only."""
    query = select(Party).options(selectinload(Party.members))
    if status_filter:
        query = query.where(Party.status == status_filter.upper())
    query = query.order_by(Party.created_at.desc())

    result = await db.execute(query)
    parties = result.scalars().unique().all()

    out = []
    for party in parties:
        members_data = []
        for m in party.members:
            cand_res = await db.execute(
                select(Candidate)
                .options(joinedload(Candidate.voter))
                .where(Candidate.candidate_id == m.candidate_id)
            )
            cand = cand_res.scalars().first()
            members_data.append({
                "candidate_id": str(m.candidate_id),
                "full_name": cand.voter.full_name if cand and cand.voter else "Unknown",
                "role": m.role,
                "is_leader": str(m.candidate_id) == str(party.leader_candidate_id),
            })
        out.append(_serialize_party(party, members_data))

    return out


@router.put("/admin/{party_id}/status")
async def admin_review_party(
    party_id: str,
    body: PartyStatusUpdate,
    admin: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve or reject a party application. Admin only."""
    try:
        party_uuid = uuid.UUID(party_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid party_id.")

    allowed_statuses = {e.value for e in PartyStatusEnum}
    new_status = body.status.upper()
    if new_status not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {allowed_statuses}")

    result = await db.execute(select(Party).where(Party.party_id == party_uuid))
    party = result.scalars().first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found.")

    party.status = new_status
    party.admin_remarks = body.admin_remarks
    party.updated_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info(f"Party {party.name} status changed to {new_status} by admin {admin.get('email')}")
    return {
        "message": f"Party status updated to {new_status}.",
        "party_id": str(party.party_id),
        "new_status": new_status,
    }
