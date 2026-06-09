import uuid
from dataclasses import dataclass

import httpx

from app.core.config import settings


@dataclass
class UploadedStorageObject:
    path: str
    public_url: str


class SupabaseStorageError(Exception):
    pass


def _get_supabase_url() -> str:
    url = settings.supabase_project_url
    if not url:
        raise SupabaseStorageError("Supabase Storage is not configured. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.")
    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise SupabaseStorageError("Supabase service role key is missing. Set SUPABASE_SERVICE_ROLE_KEY.")
    return url


async def ensure_bucket_exists(bucket_name: str) -> None:
    """Ensure the specified bucket exists in Supabase Storage. Create it if not."""
    try:
        base_url = _get_supabase_url()
        url = f"{base_url}/storage/v1/bucket"
        headers = {
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            get_res = await client.get(f"{url}/{bucket_name}", headers=headers)
            if get_res.status_code == 200:
                return  # Bucket exists!
            
            payload = {
                "id": bucket_name,
                "name": bucket_name,
                "public": True,
            }
            post_res = await client.post(url, headers=headers, json=payload)
            if post_res.status_code not in (200, 201, 204, 400):
                detail = post_res.text.strip()
                print(f"Warning: Supabase bucket creation response: {post_res.status_code} - {detail}")
    except Exception as e:
        print(f"Warning: Failed to ensure Supabase bucket exists: {e}")


async def _do_upload(
    *,
    object_path: str,
    filename: str,
    content_type: str,
    data: bytes,
    bucket: str = None,
) -> UploadedStorageObject:
    """Core upload logic — upload bytes to Supabase and return the public URL."""
    base_url = _get_supabase_url()
    active_bucket = bucket or settings.SUPABASE_STORAGE_BUCKET
    
    # Auto-ensure bucket exists
    await ensure_bucket_exists(active_bucket)

    upload_url = f"{base_url}/storage/v1/object/{active_bucket}/{object_path}"

    headers = {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": content_type or "application/octet-stream",
        "x-upsert": "true",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(upload_url, headers=headers, content=data)

    if response.status_code >= 400:
        detail = response.text.strip() or f"HTTP {response.status_code}"
        raise SupabaseStorageError(f"Supabase upload failed: {detail}")

    public_url = f"{base_url}/storage/v1/object/public/{active_bucket}/{object_path}"
    return UploadedStorageObject(path=object_path, public_url=public_url)



async def upload_campaign_media(
    *,
    candidate_id: str,
    media_type: str,
    filename: str,
    content_type: str,
    data: bytes,
) -> UploadedStorageObject:
    base_url = _get_supabase_url()
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    object_path = f"candidate/{candidate_id}/{media_type}/{uuid.uuid4().hex}.{extension}"
    return await _do_upload(object_path=object_path, filename=filename, content_type=content_type, data=data)


async def upload_concern_attachment(
    *,
    voter_id: str,
    filename: str,
    content_type: str,
    data: bytes,
) -> UploadedStorageObject:
    """Upload a concern attachment (image/video) to Supabase Storage."""
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    object_path = f"concerns/{voter_id}/{uuid.uuid4().hex}.{extension}"
    return await _do_upload(object_path=object_path, filename=filename, content_type=content_type, data=data)


async def upload_manifesto_media(
    *,
    candidate_id: str,
    filename: str,
    content_type: str,
    data: bytes,
) -> UploadedStorageObject:
    """Upload a manifesto image/document to Supabase Storage."""
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    object_path = f"manifestos/{candidate_id}/{uuid.uuid4().hex}.{extension}"
    return await _do_upload(object_path=object_path, filename=filename, content_type=content_type, data=data)


async def upload_voter_face(
    *,
    department: str,
    student_id: str,
    voter_id: str,
    filename: str,
    content_type: str,
    data: bytes,
    pending: bool = False,
) -> UploadedStorageObject:
    """Upload a voter face reference image to Supabase Storage (department/USN path)."""
    from app.services.face_storage import build_object_path, _extension_from_filename

    ext = _extension_from_filename(filename)
    object_path = build_object_path(department, student_id, voter_id, ext, pending=pending)
    return await _do_upload(object_path=object_path, filename=filename, content_type=content_type, data=data)


async def upload_election_results_pdf(
    *,
    election_id: str,
    filename: str,
    data: bytes,
) -> UploadedStorageObject:
    """Upload generated results PDF to the election-results bucket in Supabase Storage."""
    object_path = f"results/{election_id}/{uuid.uuid4().hex}.pdf"
    return await _do_upload(
        object_path=object_path,
        filename=filename,
        content_type="application/pdf",
        data=data,
        bucket="election-results"
    )

