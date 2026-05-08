"""College API service — validates student enrollment with college systems."""


class CollegeAPIService:
    async def verify_student(self, roll_number: str, email: str) -> bool:
        """Verify student enrollment with college database."""
        # TODO: Integrate with college enrollment API
        return True

    async def get_departments(self) -> list:
        """Get list of departments from college."""
        return ["Computer Science", "Electronics", "Mechanical", "Civil", "Electrical"]
