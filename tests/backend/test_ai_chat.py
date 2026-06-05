import pytest
import uuid
from unittest.mock import patch, AsyncMock, MagicMock
from app.routes.ai import _build_contextual_instruction
from app.models.candidate import Candidate
from app.models.voter import Voter
from app.models.position import Position
from app.models.manifesto import Manifesto
from app.models.election import Election

class TestAIChatContextBuilder:
    @pytest.mark.asyncio
    @patch("app.routes.ai.select")
    async def test_build_contextual_instruction_no_key_error(self, mock_select):
        """
        Verify that _build_contextual_instruction successfully builds instructions
        without raising a KeyError: 'party' when approved candidates exist.
        """
        mock_db = AsyncMock()
        
        # Setup mock entities
        election_uuid = uuid.uuid4()
        candidate_uuid = uuid.uuid4()
        voter_uuid = uuid.uuid4()
        position_uuid = uuid.uuid4()
        
        mock_election = Election(
            election_id=election_uuid,
            title="Student Council Election 2026"
        )
        
        mock_position = Position(
            position_id=position_uuid,
            election_id=election_uuid,
            title="General Secretary"
        )
        
        mock_voter = Voter(
            voter_id=voter_uuid,
            full_name="Jane Doe",
            department="CSE",
            year_of_study=3
        )
        
        mock_candidate = Candidate(
            candidate_id=candidate_uuid,
            voter_id=voter_uuid,
            election_id=election_uuid,
            position_id=position_uuid,
            status="APPROVED",
            voter=mock_voter,
            position=mock_position
        )
        
        mock_manifesto = Manifesto(
            manifesto_id=uuid.uuid4(),
            candidate_id=candidate_uuid,
            election_id=election_uuid,
            content="My awesome manifesto content."
        )

        # Sequence of execute calls in _build_contextual_instruction:
        # 1. Election query (first)
        # 2. Position query (all)
        # 3. Approved candidates query (all)
        # 4. Manifesto query per candidate (first)
        
        mock_election_res = MagicMock()
        mock_election_res.scalars.return_value.first.return_value = mock_election
        
        mock_position_res = MagicMock()
        mock_position_res.scalars.return_value.all.return_value = [mock_position.title]
        
        mock_cands_res = MagicMock()
        mock_cands_res.scalars.return_value.all.return_value = [mock_candidate]
        
        mock_manifesto_res = MagicMock()
        mock_manifesto_res.scalars.return_value.first.return_value = mock_manifesto

        mock_db.execute.side_effect = [
            mock_election_res,
            mock_position_res,
            mock_cands_res,
            mock_manifesto_res
        ]
        
        # Build contextual instruction (should NOT raise KeyError: 'party')
        instruction = await _build_contextual_instruction(db=mock_db)
        
        assert "Student Council Election 2026" in instruction
        assert "General Secretary" in instruction
        assert "Jane Doe" in instruction
        assert "Independent" in instruction
        assert "My awesome manifesto content." in instruction
