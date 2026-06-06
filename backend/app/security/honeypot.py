"""Honeypot service — traps for detecting automated/bot activity."""


class HoneypotService:
    def generate_trap(self) -> dict:
        """Generate a honeypot trap for bot detection."""
        return {
            "trap_field": "verification_field_confirm",
            "expected_value": "",
            "css_class": "hp-field-confirm",
        }

    def check_trap(self, trap_data: dict) -> bool:
        """Check if honeypot was triggered (indicates bot).

        Returns True if bot activity is detected.
        """
        # If any hidden/trap field has a value, it's a bot
        # Standard names: verification_field_confirm, hidden_field_name
        for field in ["verification_field_confirm", "hidden_field_name", "phone_confirm"]:
            if trap_data.get(field):
                return True
        return False

    def validate_timing(self, submit_time_ms: int, min_ms: int = 8000) -> bool:
        """Check if form was submitted too quickly (bot behavior).

        Returns True if bot activity is suspected.
        """
        if submit_time_ms is None:
            return False
        return submit_time_ms < min_ms
