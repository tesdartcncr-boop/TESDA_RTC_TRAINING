import json
import logging
import os
import time
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
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
RETRIABLE_METHODS = {"GET", "PATCH", "DELETE"}
MAX_REQUEST_RETRIES = 2
RETRY_DELAY_SECONDS = 0.35


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
        "Connection": "keep-alive",
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

    request_method = method.upper()
    start_time = time.time()

    for attempt in range(MAX_REQUEST_RETRIES + 1):
        url = _build_url(path, params)
        body = None if payload is None else json.dumps(_serialize(payload)).encode("utf-8")
        request = Request(
            url,
            data=body,
            headers=_build_headers(prefer=prefer, extra_headers=headers),
            method=request_method,
        )

        try:
            with urlopen(request, timeout=30) as response:
                raw_body = response.read().decode("utf-8")
                parsed_body = json.loads(raw_body) if raw_body else None
                elapsed = time.time() - start_time
                logger.info("DB Request: %s %s - %.3fs", request_method, path, elapsed)
                if elapsed > 1.0:
                    logger.warning("SLOW DB Request: %s %s took %.3fs", request_method, path, elapsed)
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

            if (
                request_method in RETRIABLE_METHODS
                and exc.code >= 500
                and attempt < MAX_REQUEST_RETRIES
            ):
                logger.warning(
                    "Retrying Supabase request after HTTP %s: %s %s",
                    exc.code,
                    request_method,
                    path,
                )
                time.sleep(RETRY_DELAY_SECONDS * (attempt + 1))
                continue

            logger.error("Supabase request failed: %s %s -> %s", request_method, path, message)
            raise SupabaseAPIError(exc.code, message, parsed_body) from exc
        except URLError as exc:
            if request_method in RETRIABLE_METHODS and attempt < MAX_REQUEST_RETRIES:
                logger.warning(
                    "Retrying Supabase network request after error %s: %s %s",
                    exc.reason,
                    request_method,
                    path,
                )
                time.sleep(RETRY_DELAY_SECONDS * (attempt + 1))
                continue

            logger.error("Supabase network error: %s", exc.reason)
            raise SupabaseAPIError(503, f"Failed to reach Supabase: {exc.reason}") from exc


def select_rows(
    table: str,
    *,
    filters: Optional[dict[str, Any]] = None,
    select: str = "*",
    order: Optional[str] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
):
    params = {"select": select}
    if filters:
        params.update(filters)
    if order:
        params["order"] = order
    if limit is not None:
        params["limit"] = str(limit)
    if offset is not None:
        params["offset"] = str(offset)

    data, headers = supabase_request("GET", f"/rest/v1/{table}", params=params)
    
    # Extract total count from Content-Range header if available
    content_range = headers.get("Content-Range", "")
    total_count = None
    if "/" in content_range:
        try:
            total_count = int(content_range.rsplit("/", 1)[1])
        except (ValueError, IndexError):
            pass
    
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


def update_rows(table: str, payload: dict[str, Any], *, filters: dict[str, Any]):
    data, _ = supabase_request(
        "PATCH",
        f"/rest/v1/{table}",
        params=filters,
        payload=payload,
        prefer=["return=representation"],
    )
    return data or []


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
