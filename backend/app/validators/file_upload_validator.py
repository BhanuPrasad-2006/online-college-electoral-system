"""Centralized file upload validation with magic bytes, MIME cross-check, and size enforcement."""

import os
from dataclasses import dataclass


@dataclass
class ValidationResult:
    passed: bool
    reason: str = ""


# Magic byte signatures for common file types
MAGIC_BYTES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"\x47\x49\x46\x38": "image/gif",
    b"\x42\x4d": "image/bmp",
    b"\x52\x49\x46\x46": "image/webp",  # RIFF header for WEBP
    b"\x00\x00\x00\x18\x66\x74\x79\x70\x6d\x70\x34\x32": "video/mp4",  # mp42
    b"\x00\x00\x00\x1c\x66\x74\x79\x70\x6d\x70\x34\x32": "video/mp4",  # mp42 variant
    b"\x00\x00\x00\x20\x66\x74\x79\x70\x6d\x70\x34\x32": "video/mp4",  # mp42 variant
    b"\x00\x00\x00\x14\x66\x74\x79\x70\x69\x73\x6f\x6d": "video/mp4",  # isom
    b"\x00\x00\x00\x1c\x66\x74\x79\x70\x69\x73\x6f\x6d": "video/mp4",  # isom variant
    b"\x00\x00\x00\x18\x66\x74\x79\x70\x69\x73\x6f\x6d": "video/mp4",  # isom variant
}


ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}
ALLOWED_DOCUMENT_EXTENSIONS = {".pdf", ".doc", ".docx"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4"}


VALID_IMAGE_MIMETYPES = {"image/png", "image/jpeg", "image/jpg"}
VALID_VIDEO_MIMETYPES = {"video/mp4"}
VALID_DOCUMENT_MIMETYPES = {"application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}


MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB
MAX_DOCUMENT_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_VIDEO_SIZE = 20 * 1024 * 1024  # 20 MB


def _check_magic_bytes(data: bytes) -> str | None:
    """Check magic bytes of the file data to determine true MIME type."""
    for signature, mime_type in MAGIC_BYTES.items():
        if data[:len(signature)] == signature:
            return mime_type
    # No fallback - magic bytes cover all supported formats
    return None


def validate_image_upload(
    data: bytes,
    filename: str | None = None,
    content_type: str | None = None,
    max_size_bytes: int = MAX_IMAGE_SIZE,
) -> ValidationResult:
    """
    Validate an image file upload.
    Checks: size, extension, MIME type, and magic bytes.
    """
    # Size check
    if len(data) > max_size_bytes:
        max_mb = max_size_bytes / (1024 * 1024)
        return ValidationResult(
            passed=False,
            reason=f"File size exceeds the maximum allowed size of {max_mb:.0f} MB."
        )

    if len(data) == 0:
        return ValidationResult(passed=False, reason="Uploaded file is empty.")

    # Extension check
    if filename:
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            return ValidationResult(
                passed=False,
                reason=f"File extension '{ext}' is not allowed for images. Allowed: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}"
            )

    # MIME type check
    if content_type and content_type not in VALID_IMAGE_MIMETYPES:
        return ValidationResult(
            passed=False,
            reason=f"Invalid MIME type '{content_type}'. Allowed: {', '.join(VALID_IMAGE_MIMETYPES)}"
        )

    # Magic byte validation
    detected_mime = _check_magic_bytes(data)
    if detected_mime and detected_mime not in VALID_IMAGE_MIMETYPES:
        return ValidationResult(
            passed=False,
            reason=f"File content (magic bytes) indicates '{detected_mime}', which is not an allowed image format."
        )

    return ValidationResult(passed=True)


def validate_media_upload(
    data: bytes,
    filename: str | None = None,
    content_type: str | None = None,
    max_size_bytes: int = MAX_IMAGE_SIZE,
) -> ValidationResult:
    """
    Validate a media (image or video) file upload.
    Supports both images and videos with magic byte checking.
    """
    # Size check
    if len(data) > max_size_bytes:
        max_mb = max_size_bytes / (1024 * 1024)
        return ValidationResult(
            passed=False,
            reason=f"File size exceeds the maximum allowed size of {max_mb:.0f} MB."
        )

    if len(data) == 0:
        return ValidationResult(passed=False, reason="Uploaded file is empty.")

    # Extension check
    if filename:
        ext = os.path.splitext(filename)[1].lower()
        allowed = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS
        if ext not in allowed:
            return ValidationResult(
                passed=False,
                reason=f"File extension '{ext}' is not allowed. Allowed: {', '.join(allowed)}"
            )

    # MIME type check
    valid_mimes = VALID_IMAGE_MIMETYPES | VALID_VIDEO_MIMETYPES
    if content_type and content_type not in valid_mimes:
        return ValidationResult(
            passed=False,
            reason=f"Invalid MIME type '{content_type}'. Allowed: {', '.join(valid_mimes)}"
        )

    # Magic byte validation
    detected_mime = _check_magic_bytes(data)
    if detected_mime and detected_mime not in valid_mimes:
        return ValidationResult(
            passed=False,
            reason=f"File content (magic bytes) indicates '{detected_mime}', which is not an allowed media format."
        )

    return ValidationResult(passed=True)


def validate_document_upload(
    data: bytes,
    filename: str | None = None,
    content_type: str | None = None,
    max_size_bytes: int = MAX_DOCUMENT_SIZE,
) -> ValidationResult:
    """
    Validate a document file upload (PDF, DOC, DOCX).
    Checks: size, extension, and MIME type.
    """
    # Size check
    if len(data) > max_size_bytes:
        max_mb = max_size_bytes / (1024 * 1024)
        return ValidationResult(
            passed=False,
            reason=f"File size exceeds the maximum allowed size of {max_mb:.0f} MB."
        )

    if len(data) == 0:
        return ValidationResult(passed=False, reason="Uploaded file is empty.")

    # Extension check
    if filename:
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_DOCUMENT_EXTENSIONS:
            return ValidationResult(
                passed=False,
                reason=f"File extension '{ext}' is not allowed for documents. Allowed: {', '.join(ALLOWED_DOCUMENT_EXTENSIONS)}"
            )

    # MIME type check
    if content_type and content_type not in VALID_DOCUMENT_MIMETYPES:
        return ValidationResult(
            passed=False,
            reason=f"Invalid MIME type '{content_type}'. Allowed: {', '.join(VALID_DOCUMENT_MIMETYPES)}"
        )

    return ValidationResult(passed=True)


def validate_concern_upload(
    data: bytes,
    filename: str | None = None,
    content_type: str | None = None,
    max_size_bytes: int = MAX_IMAGE_SIZE,
) -> ValidationResult:
    """
    Validate an attachment file upload for concerns.
    Allows images, PDFs, and documents.
    """
    # Size check
    if len(data) > max_size_bytes:
        max_mb = max_size_bytes / (1024 * 1024)
        return ValidationResult(
            passed=False,
            reason=f"Attachment size exceeds the maximum allowed size of {max_mb:.0f} MB."
        )

    if len(data) == 0:
        return ValidationResult(passed=False, reason="Uploaded file is empty.")

    # Extension check
    if filename:
        ext = os.path.splitext(filename)[1].lower()
        allowed = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_DOCUMENT_EXTENSIONS
        if ext not in allowed:
            return ValidationResult(
                passed=False,
                reason=f"File extension '{ext}' is not allowed. Allowed: {', '.join(allowed)}"
            )

    # MIME type check
    valid_mimes = VALID_IMAGE_MIMETYPES | VALID_DOCUMENT_MIMETYPES
    if content_type and content_type not in valid_mimes:
        return ValidationResult(
            passed=False,
            reason=f"Invalid MIME type '{content_type}'. Allowed: {', '.join(valid_mimes)}"
        )

    return ValidationResult(passed=True)
