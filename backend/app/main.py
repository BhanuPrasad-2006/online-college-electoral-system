"""
Re-export for deployment compatibility
(Vercel/Docker/Gunicorn: app.main:app)
"""

import app.models

from main import app  # noqa: F401