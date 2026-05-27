import pytest
import uuid
from unittest.mock import patch, AsyncMock, MagicMock
from app.routes.ai import get_concern_categories
from app.models.candidate import Candidate
from app.models.concern import Concern
from app.models.manifesto import Manifesto
from app.enums.concern_enums import ConcernCategoryEnum, SentimentEnum


class TestAIReportIntegration:
    @pytest.mark.asyncio
    @patch("app.routes.ai.select")
    async def test_get_concern_categories_no_concerns(self, mock_select):
        # Setup mocks
        mock_db = AsyncMock()
        mock_user = {"user_id": str(uuid.uuid4())}
        
        # Mock candidate fetch
        mock_candidate = Candidate(
            candidate_id=uuid.uuid4(),
            election_id=uuid.uuid4(),
            status="APPROVED"
        )
        
        # DB calls sequencing: first candidate, then concerns (empty)
        mock_cand_res = MagicMock()
        mock_cand_res.scalar_one_or_none.return_value = mock_candidate
        
        mock_concern_res = MagicMock()
        mock_concern_res.scalars.return_value.all.return_value = []
        
        mock_db.execute.side_effect = [mock_cand_res, mock_concern_res]
        
        result = await get_concern_categories(current_user=mock_user, db=mock_db)
        
        assert result == []

    @pytest.mark.asyncio
    @patch("app.routes.ai.select")
    @patch("app.routes.ai.AIProxyService.analyze_gaps", new_callable=AsyncMock)
    async def test_get_concern_categories_with_concerns(self, mock_analyze_gaps, mock_select):
        # Setup mocks
        mock_db = AsyncMock()
        mock_user = {"user_id": str(uuid.uuid4())}
        
        election_uuid = uuid.uuid4()
        candidate_uuid = uuid.uuid4()
        mock_candidate = Candidate(
            candidate_id=candidate_uuid,
            election_id=election_uuid,
            status="APPROVED"
        )
        
        # Create mock concerns with different categories and sentiments
        c1 = Concern(
            concern_id=str(uuid.uuid4()),
            election_id=election_uuid,
            category=ConcernCategoryEnum.ACADEMIC,
            sentiment=SentimentEnum.POSITIVE
        )
        c2 = Concern(
            concern_id=str(uuid.uuid4()),
            election_id=election_uuid,
            category=ConcernCategoryEnum.ACADEMIC,
            sentiment=SentimentEnum.NEGATIVE
        )
        c3 = Concern(
            concern_id=str(uuid.uuid4()),
            election_id=election_uuid,
            category=ConcernCategoryEnum.INFRASTRUCTURE,
            sentiment=SentimentEnum.NEUTRAL
        )
        
        # DB calls sequencing:
        # 1. Fetch Candidate
        mock_cand_res = MagicMock()
        mock_cand_res.scalar_one_or_none.return_value = mock_candidate
        
        # 2. Fetch Concerns
        mock_concern_res = MagicMock()
        mock_concern_res.scalars.return_value.all.return_value = [c1, c2, c3]
        
        # 3. Fetch Manifesto
        mock_manifesto = Manifesto(
            candidate_id=candidate_uuid,
            election_id=election_uuid,
            content="We will improve campus infrastructure and learning."
        )
        mock_manifesto_res = MagicMock()
        mock_manifesto_res.scalars.return_value.first.return_value = mock_manifesto
        
        mock_db.execute.side_effect = [mock_cand_res, mock_concern_res, mock_manifesto_res]
        
        # Mock gap analysis response from AI service
        mock_analyze_gaps.return_value = {
            "coverages": [
                {"category_name": "Academic", "covered": False, "explanation": "Gaps found in study materials"},
                {"category_name": "Infrastructure", "covered": True, "explanation": "Covered via upgrade plans"}
            ]
        }
        
        result = await get_concern_categories(current_user=mock_user, db=mock_db)
        
        assert len(result) == 2
        
        academic_res = next(x for x in result if x["name"] == "Academic")
        infra_res = next(x for x in result if x["name"] == "Infrastructure")
        
        assert academic_res["mentions"] == 2
        assert academic_res["positive"] == 50
        assert academic_res["negative"] == 50
        assert academic_res["neutral"] == 0
        assert academic_res["covered"] is False
        
        assert infra_res["mentions"] == 1
        assert infra_res["positive"] == 0
        assert infra_res["negative"] == 0
        assert infra_res["neutral"] == 100
        assert infra_res["covered"] is True
        
        mock_analyze_gaps.assert_called_once_with(mock_manifesto.content, ["Academic", "Infrastructure"])
