"""Structured logging configuration using structlog."""

import sys
import structlog

# Windows console (cmd.exe) uses cp437/cp1252 by default, which cannot encode many
# Unicode characters used by structlog's ConsoleRenderer. Use a JSON renderer that
# produces ASCII-safe output so logging never crashes on encoding errors.
# 
# Also reconfigure stdout/stderr to replace (not crash on) any remaining encoding issues.
if sys.platform == "win32":
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is not None and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (AttributeError, ValueError, OSError):
                pass

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        # JSON renderer avoids all Unicode rendering issues on Windows terminals.
        structlog.processors.JSONRenderer(ensure_ascii=True),
    ],
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger()
