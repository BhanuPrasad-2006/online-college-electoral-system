import asyncio
from app.services.pdf_service import PDFService

def test_pdf_generation():
    print("Testing results PDF generation...")
    college_name = "State University Electoral Board"
    election_name = "Student Body Representative Election"
    election_year = "2026"
    election_id = "00000000-0000-0000-0000-000000000001"
    publication_id = "00000000-0000-0000-0000-000000000002"
    published_by_email = "chief-officer@stateuni.edu"
    published_at_str = "2026-06-09 14:32:00 UTC"
    audit_hash = "f7c9e0d1b3a5c2d8e4f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8"
    
    mock_results = [
        {
            "position": "President",
            "candidates": [
                {"name": "Priya Sharma", "votes": 350, "percentage": 58.33, "is_winner": True},
                {"name": "Arjun Mehta", "votes": 250, "percentage": 41.67, "is_winner": False}
            ]
        },
        {
            "position": "Vice President",
            "candidates": [
                {"name": "Kavya Reddy", "votes": 300, "percentage": 50.0, "is_winner": True},
                {"name": "Rahul Kumar", "votes": 300, "percentage": 50.0, "is_winner": True}
            ]
        }
    ]
    
    try:
        pdf_bytes = PDFService.generate_election_results_pdf(
            college_name=college_name,
            election_name=election_name,
            election_year=election_year,
            election_id=election_id,
            publication_id=publication_id,
            published_by_email=published_by_email,
            published_at_str=published_at_str,
            audit_hash=audit_hash,
            results=mock_results
        )
        assert len(pdf_bytes.getvalue()) > 0
        print("Success: results PDF generated successfully! Size:", len(pdf_bytes.getvalue()))
        
        # Save to disk for inspection
        with open("test_results_output.pdf", "wb") as f:
            f.write(pdf_bytes.getvalue())
        print("PDF saved as test_results_output.pdf")
    except Exception as e:
        print("Fail: results PDF generation failed:", e)

if __name__ == "__main__":
    test_pdf_generation()
