"""Honeypot service — traps for detecting automated/bot activity."""


class HoneypotService:
    def generate_trap(self) -> dict:
        """Generate a honeypot trap for bot detection."""
        return {
            "trap_field": "hidden_field_name",
            "expected_value": "",
            "css_class": "hp-field",
        }

    def check_trap(self, trap_data: dict) -> bool:
        """Check if honeypot was triggered (indicates bot).

        Returns True if bot activity is detected.
        """
        # If hidden field has a value, it's likely a bot
        return bool(trap_data.get("hidden_field_name"))

    def validate_timing(self, submit_time_ms: int, min_ms: int = 3000) -> bool:
        """Check if form was submitted too quickly (bot behavior).

        Returns True if bot activity is suspected.
        """
        return submit_time_ms < min_ms
