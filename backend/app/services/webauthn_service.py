"""WebAuthn service — passwordless authentication via FIDO2."""


class WebAuthnService:
    async def begin_registration(self, user_id: str, user_name: str):
        """Start WebAuthn registration ceremony."""
        # TODO: Implement using py-webauthn
        pass

    async def complete_registration(self, user_id: str, credential):
        """Complete WebAuthn registration."""
        pass

    async def begin_authentication(self, user_id: str):
        """Start WebAuthn authentication ceremony."""
        pass

    async def complete_authentication(self, user_id: str, assertion):
        """Complete WebAuthn authentication."""
        pass
