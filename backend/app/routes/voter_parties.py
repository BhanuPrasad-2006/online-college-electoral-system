"""Voter-facing party routes — party invitation management for voters."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.db.session import get_db
from app.api.deps import get_current_user, get_voter_user
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
from app.utils.logger import logger

router = APIRouter()


@router.get("/party-invitations", status_code=status.HTTP_200_OK)
async def get_my_party_invitations(
    current_user: dict = Depends(get_voter_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all party invitations for the logged-in voter (pending and historical)."""
    voter_id = uuid.UUID(current_user["user_id"])

    result = await db.execute(
        select(PartyInvitation)
        .options(joinedload(PartyInvitation.party))
        .where(PartyInvitation.invited_voter_id == voter_id)
        .order_by(PartyInvitation.created_at.desc())
    )
    invitations = result.scalars().unique().all()

    out = []
    for inv in invitations:
        party = inv.party
        # Find who sent it
        sender_name = "Party Leader"
        if inv.invited_by_candidate_id:
            cand_res = await db.execute(
                select(Candidate)
                .options(joinedload(Candidate.voter))
                .where(Candidate.candidate_id == inv.invited_by_candidate_id)
            )
            cand = cand_res.scalars().first()
            if cand and cand.voter:
                sender_name = cand.voter.full_name

        out.append({
            "invitation_id": str(inv.invitation_id),
            "party_id": str(inv.party_id),
            "party_name": party.name if party else "Unknown Party",
            "party_status": party.status if party else None,
            "party_logo_url": party.logo_url if party else None,
            "invited_by": sender_name,
            "role": inv.role,
            "position": inv.position,
            "message": inv.message,
            "status": inv.status,
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
            "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
            "responded_at": inv.responded_at.isoformat() if inv.responded_at else None,
        })

    return out


@router.post("/party-invitations/{invitation_id}/accept", status_code=status.HTTP_200_OK)
async def accept_party_invitation(
    invitation_id: str,
    current_user: dict = Depends(get_voter_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept a party invitation — creates a Candidate record and adds to party."""
    voter_id = uuid.UUID(current_user["user_id"])

    try:
        inv_uuid = uuid.UUID(invitation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invitation_id.")

    # Load invitation
    result = await db.execute(
        select(PartyInvitation)
        .options(joinedload(PartyInvitation.party))
        .where(
            PartyInvitation.invitation_id == inv_uuid,
            PartyInvitation.invited_voter_id == voter_id,
        )
    )
    invitation = result.scalars().first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found.")

    if invitation.status != InvitationStatusEnum.PENDING.value:
        raise HTTPException(
            status_code=400,
            detail=f"Invitation is no longer pending (status: {invitation.status}).",
        )

    # Check expiry
    if invitation.expires_at:
        expires = invitation.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            invitation.status = InvitationStatusEnum.EXPIRED.value
            await db.commit()
            raise HTTPException(status_code=410, detail="This invitation has expired.")

    party = invitation.party
    if not party:
        raise HTTPException(status_code=404, detail="Party no longer exists.")

    # Verify voter is not already a candidate
    existing = await db.execute(
        select(Candidate).where(Candidate.voter_id == voter_id)
    )
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="You are already a registered candidate.")

    # Load voter
    voter_res = await db.execute(select(Voter).where(Voter.voter_id == voter_id))
    voter = voter_res.scalars().first()
    if not voter:
        raise HTTPException(status_code=404, detail="Voter not found.")

    # Get the latest election
    election_res = await db.execute(select(Election).order_by(Election.created_at.desc()))
    election = election_res.scalars().first()
    if not election:
        raise HTTPException(status_code=404, detail="No active election found.")

    # Get party's position
    position_id = party.position_id
    if not position_id:
        raise HTTPException(status_code=400, detail="Party has no associated position.")

    # Create Candidate record
    new_candidate = Candidate(
        voter_id=voter_id,
        election_id=election.election_id,
        position_id=position_id,
        party_id=party.party_id,
        candidate_type="PARTY",
        party_role=invitation.role or "MEMBER",
        status=CandidateStatusEnum.PENDING.value,
    )
    db.add(new_candidate)
    await db.flush()

    # Create PartyMember record
    member = PartyMember(
        party_id=party.party_id,
        candidate_id=new_candidate.candidate_id,
        role=invitation.role or "MEMBER",
        position=invitation.position,
    )
    db.add(member)

    # Mark invitation accepted
    invitation.status = InvitationStatusEnum.ACCEPTED.value
    invitation.responded_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(new_candidate)

    logger.info(
        f"Voter {voter_id} accepted party invitation {inv_uuid} — "
        f"new candidate {new_candidate.candidate_id} for party {party.party_id}"
    )

    return {
        "message": "Invitation accepted. You are now a party candidate member.",
        "candidate_id": str(new_candidate.candidate_id),
        "party_id": str(party.party_id),
        "role": invitation.role or "MEMBER",
    }


@router.post("/party-invitations/{invitation_id}/reject", status_code=status.HTTP_200_OK)
async def reject_party_invitation(
    invitation_id: str,
    current_user: dict = Depends(get_voter_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject a party invitation."""
    voter_id = uuid.UUID(current_user["user_id"])

    try:
        inv_uuid = uuid.UUID(invitation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invitation_id.")

    result = await db.execute(
        select(PartyInvitation).where(
            PartyInvitation.invitation_id == inv_uuid,
            PartyInvitation.invited_voter_id == voter_id,
        )
    )
    invitation = result.scalars().first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found.")

    if invitation.status != InvitationStatusEnum.PENDING.value:
        raise HTTPException(
            status_code=400,
            detail=f"Invitation is no longer pending (status: {invitation.status}).",
        )

    invitation.status = InvitationStatusEnum.DECLINED.value
    invitation.responded_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info(f"Voter {voter_id} rejected invitation {inv_uuid}")
    return {
        "message": "Invitation rejected.",
        "invitation_id": str(invitation_id),
    }
