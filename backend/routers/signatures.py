import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from .auth import CurrentUser
from ..supabase_rest import SupabaseAPIError, get_public_error_message, insert_row, select_one, select_rows, update_row

router = APIRouter()

ALLOWED_SIGNATURE_ROLES = {"admin", "supervisor"}
MAX_SIGNATURE_DATA_URL_LENGTH = 750_000
SIGNATURE_DATA_URL_PATTERN = re.compile(r"^data:(image/(?:png|jpeg));base64,[A-Za-z0-9+/=]+$")


class SignatureSaveRequest(BaseModel):
    image_data: str = Field(..., min_length=1, max_length=MAX_SIGNATURE_DATA_URL_LENGTH)
    file_name: Optional[str] = Field(default=None, max_length=255)


class SignatureLookupRequest(BaseModel):
    user_ids: list[int] = Field(default_factory=list, max_length=50)


def raise_supabase_http(exc: SupabaseAPIError):
    status_code = exc.status_code if 400 <= exc.status_code < 600 else status.HTTP_500_INTERNAL_SERVER_ERROR
    raise HTTPException(status_code=status_code, detail=get_public_error_message(exc)) from exc


def require_signature_role(current_user: dict):
    if current_user.get("user_type") not in ALLOWED_SIGNATURE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admin and center chief accounts can manage signatures.")


def normalize_signature_payload(payload: SignatureSaveRequest) -> dict:
    image_data = payload.image_data.strip()
    match = SIGNATURE_DATA_URL_PATTERN.match(image_data)
    if not match:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Signature must be a PNG or JPEG image.")

    return {
        "image_data": image_data,
        "mime_type": match.group(1),
        "file_name": payload.file_name or "signature.png",
    }


def serialize_signature(row: dict | None) -> dict | None:
    if not row:
        return None
    return {
        "id": row.get("id"),
        "user_id": row.get("user_id"),
        "image_data": row.get("image_data"),
        "mime_type": row.get("mime_type"),
        "file_name": row.get("file_name"),
        "updated_at": row.get("updated_at"),
    }


@router.get("/me")
async def get_my_signature(current_user: CurrentUser):
    require_signature_role(current_user)
    try:
        row = select_one("user_signatures", filters={"user_id": f"eq.{current_user['id']}"})
        return {"data": serialize_signature(row)}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.put("/me")
async def save_my_signature(payload: SignatureSaveRequest, current_user: CurrentUser):
    require_signature_role(current_user)
    signature_payload = normalize_signature_payload(payload)
    now = datetime.now(timezone.utc).isoformat()

    try:
        existing = select_one("user_signatures", filters={"user_id": f"eq.{current_user['id']}"}, select="id,user_id")
        if existing:
            row = update_row(
                "user_signatures",
                {**signature_payload, "updated_at": now},
                filters={"user_id": f"eq.{current_user['id']}"},
            )
        else:
            row = insert_row(
                "user_signatures",
                {
                    **signature_payload,
                    "user_id": current_user["id"],
                    "created_at": now,
                    "updated_at": now,
                },
            )
        return {"data": serialize_signature(row)}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.post("/lookup")
async def lookup_signatures(payload: SignatureLookupRequest, current_user: CurrentUser):
    require_signature_role(current_user)
    user_ids = sorted({int(user_id) for user_id in payload.user_ids if user_id})
    if not user_ids:
        return {"data": {}}

    try:
        rows = select_rows(
            "user_signatures",
            filters={"user_id": f"in.({','.join(map(str, user_ids))})"},
            select="id,user_id,image_data,mime_type,file_name,updated_at",
        )
        return {"data": {str(row["user_id"]): serialize_signature(row) for row in rows}}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
