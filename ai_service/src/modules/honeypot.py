"""Honeypot module — traps for detecting automated/bot activity."""


class HoneypotService:
    def generate_trap(self) -> dict:
        """Generate a honeypot trap for bot detection."""
        # TODO: Create hidden form fields, invisible links
        return {"trap_field": "hidden_field_name", "expected_value": ""}

    def check_trap(self, trap_data: dict) -> bool:
        """Check if honeypot was triggered (indicates bot)."""
        # If hidden field has a value, it's likely a bot
        return bool(trap_data.get("hidden_field_name"))
