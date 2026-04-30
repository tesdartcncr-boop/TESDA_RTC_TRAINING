import json
import logging
import os
from datetime import date, datetime
from enum import Enum
from pathlib import Path
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv

env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


class SupabaseAPIError(Exception):
    def __init__(self, status_code: int, message: str, details: Optional[Any] = None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.details = details


def _serialize(value: Any):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, list):
        return [_serialize(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize(item) for key, item in value.items()}
    return value


def _build_url(path: str, params: Optional[dict[str, Any]] = None) -> str:
    base_url = f"{SUPABASE_URL}{path}"
    if not params:
        return base_url

    encoded_params = urlencode(_serialize(params), doseq=True, safe="*,.():")
    return f"{base_url}?{encoded_params}"


def _build_headers(prefer: Optional[list[str]] = None, extra_headers: Optional[dict[str, str]] = None):
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }

    if prefer:
        headers["Prefer"] = ",".join(prefer)

    if extra_headers:
        headers.update(extra_headers)

    return headers


def supabase_request(
    method: str,
    path: str,
    params: Optional[dict[str, Any]] = None,
    payload: Optional[Any] = None,
    prefer: Optional[list[str]] = None,
    headers: Optional[dict[str, str]] = None,
):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise SupabaseAPIError(500, "Supabase environment variables are not configured.")

    url = _build_url(path, params)
    body = None if payload is None else json.dumps(_serialize(payload)).encode("utf-8")
    request = Request(
        url,
        data=body,
        headers=_build_headers(prefer=prefer, extra_headers=headers),
        method=method.upper(),
    )

    try:
        with urlopen(request, timeout=30) as response:
            raw_body = response.read().decode("utf-8")
            parsed_body = json.loads(raw_body) if raw_body else None
            return parsed_body, response.headers
    except HTTPError as exc:
        raw_body = exc.read().decode("utf-8", errors="replace")
        parsed_body = None
        try:
            parsed_body = json.loads(raw_body) if raw_body else None
        except json.JSONDecodeError:
            parsed_body = None

        message = (
            (parsed_body or {}).get("message")
            or (parsed_body or {}).get("error_description")
            or (parsed_body or {}).get("hint")
            or raw_body
            or "Supabase request failed."
        )
        logger.error("Supabase request failed: %s %s -> %s", method.upper(), path, message)
        raise SupabaseAPIError(exc.code, message, parsed_body) from exc
    except URLError as exc:
        logger.error("Supabase network error: %s", exc.reason)
        raise SupabaseAPIError(503, f"Failed to reach Supabase: {exc.reason}") from exc


def select_rows(
    table: str,
    *,
    filters: Optional[dict[str, Any]] = None,
    select: str = "*",
    order: Optional[str] = None,
    limit: Optional[int] = None,
):
    params = {"select": select}
    if filters:
        params.update(filters)
    if order:
        params["order"] = order
    if limit is not None:
        params["limit"] = str(limit)

    data, _ = supabase_request("GET", f"/rest/v1/{table}", params=params)
    return data or []


def select_one(
    table: str,
    *,
    filters: Optional[dict[str, Any]] = None,
    select: str = "*",
    order: Optional[str] = None,
):
    rows = select_rows(table, filters=filters, select=select, order=order, limit=1)
    return rows[0] if rows else None


def insert_row(table: str, payload: dict[str, Any]):
    data, _ = supabase_request(
        "POST",
        f"/rest/v1/{table}",
        payload=payload,
        prefer=["return=representation"],
    )
    if isinstance(data, list):
        return data[0] if data else None
    return data


def update_row(table: str, payload: dict[str, Any], *, filters: dict[str, Any]):
    data, _ = supabase_request(
        "PATCH",
        f"/rest/v1/{table}",
        params=filters,
        payload=payload,
        prefer=["return=representation"],
    )
    if isinstance(data, list):
        return data[0] if data else None
    return data


def delete_rows(table: str, *, filters: dict[str, Any], returning: str = "representation"):
    data, _ = supabase_request(
        "DELETE",
        f"/rest/v1/{table}",
        params=filters,
        prefer=[f"return={returning}"],
    )
    return data or []


def count_rows(table: str, *, filters: Optional[dict[str, Any]] = None):
    params = {"select": "id", "limit": "1"}
    if filters:
        params.update(filters)

    _, headers = supabase_request(
        "GET",
        f"/rest/v1/{table}",
        params=params,
        prefer=["count=exact"],
    )
    content_range = headers.get("Content-Range", "")
    if "/" not in content_range:
        return 0

    total = content_range.rsplit("/", 1)[1]
    try:
        return int(total)
    except ValueError:
        return 0
