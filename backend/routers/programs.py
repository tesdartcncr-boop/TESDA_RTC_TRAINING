from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .auth import get_current_user
from ..cache_manager import cache_manager
from ..schemas import ProgramCreate, ProgramResponse, ProgramUpdate
from ..supabase_rest import SupabaseAPIError, count_rows, get_public_error_message, insert_row, select_one, select_rows, update_row

router = APIRouter()

ADMIN_ACCESS_DENIED = "Access denied. Admin access required."
PROGRAM_NOT_FOUND = "Program not found"
PROGRAMS_CACHE_PATTERN = "programs:*"
SCHEDULES_CACHE_PATTERN = "schedules:*"
DEFAULT_SCHEDULE_LABEL = "8 Hours/Day"
CurrentUser = Annotated[dict, Depends(get_current_user)]
FILTER_TRUE = "eq.true"
ORDER_DESC = "created_at.desc"


def raise_supabase_http(exc: SupabaseAPIError):
    status_code = exc.status_code if 400 <= exc.status_code < 600 else status.HTTP_500_INTERNAL_SERVER_ERROR
    raise HTTPException(status_code=status_code, detail=get_public_error_message(exc)) from exc


def normalize_program_payload(payload: dict[str, Any]) -> dict[str, Any]:
    schedule = payload.get("schedule") or DEFAULT_SCHEDULE_LABEL
    hours = payload.get("hours") or 0
    hours_per_day = 4 if str(schedule).startswith("4") else 8

    if hours and hours_per_day > 0:
        payload["days"] = -(-int(hours) // hours_per_day)
    elif payload.get("days"):
        payload["days"] = int(payload["days"])
    else:
        payload["days"] = None

    payload["schedule"] = schedule
    return payload


@router.get("/")
async def get_programs(
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    page: int | None = Query(None, ge=1),
    search: str | None = Query(None),
):
    # Support both page and skip parameters
    if page is not None:
        skip = (page - 1) * limit
    
    cache_key = cache_manager.get_cache_key("programs", skip=skip, limit=limit, search=search)
    cached = cache_manager.get(cache_key)
    if cached:
        return cached

    try:
        filters = {"is_active": FILTER_TRUE}
        
        # Apply search filter at database level
        if search:
            filters["or"] = f"(name.ilike.%{search}%,description.ilike.%{search}%,validity.ilike.%{search}%,type.ilike.%{search}%,recognition_number.ilike.%{search}%)"

        total = count_rows("programs", filters=filters)
        
        # Fetch paginated results directly from database
        programs = select_rows(
            "programs",
            filters=filters,
            order=ORDER_DESC,
            limit=limit,
            offset=skip,
            select="id,name,description,type,validity,hours,schedule,days,is_active,recognition_number,created_at"
        )
        
        # Check if there are more results
        has_more = (skip + len(programs)) < total
        total_pages = max(1, -(-total // limit))
        
        response = {
            "data": programs,
            "total": total,
            "skip": skip,
            "limit": limit,
            "currentPage": (skip // limit) + 1,
            "totalPages": total_pages,
            "has_more": has_more,
        }
        cache_manager.set(cache_key, response, 300000)  # 5 min cache
        return response
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.post("/", response_model=ProgramResponse)
async def create_program(program_data: ProgramCreate, current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    payload = normalize_program_payload(
        {
            "name": program_data.name,
            "description": program_data.description,
            "type": program_data.type.value,
            "validity": program_data.validity,
            "hours": program_data.hours,
            "schedule": program_data.schedule,
            "days": program_data.days,
            "recognition_number": program_data.recognition_number,
            "created_by": current_user["id"],
            "is_active": True,
        }
    )

    try:
        result = insert_row("programs", payload)
        cache_manager.clear_pattern(PROGRAMS_CACHE_PATTERN)
        cache_manager.clear_pattern(SCHEDULES_CACHE_PATTERN)
        return result
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/{program_id}", response_model=ProgramResponse)
async def get_program(program_id: int, current_user: CurrentUser):
    try:
        program = select_one("programs", filters={"id": f"eq.{program_id}"})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not program:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PROGRAM_NOT_FOUND)
    return program


@router.put("/{program_id}", response_model=ProgramResponse)
async def update_program(program_id: int, program_data: ProgramUpdate, current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    try:
        program = select_one("programs", filters={"id": f"eq.{program_id}"})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not program:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PROGRAM_NOT_FOUND)

    update_data = program_data.dict(exclude_unset=True)
    if "type" in update_data and update_data["type"] is not None:
        update_data["type"] = update_data["type"].value

    update_data = normalize_program_payload({**program, **update_data})
    for internal_field in ("id", "created_at", "created_by", "updated_at", "is_active"):
        update_data.pop(internal_field, None)

    if "is_active" in program_data.dict(exclude_unset=True):
        update_data["is_active"] = program_data.is_active

    try:
        updated_program = update_row("programs", update_data, filters={"id": f"eq.{program_id}"})
        cache_manager.clear_pattern(PROGRAMS_CACHE_PATTERN)
        cache_manager.clear_pattern(SCHEDULES_CACHE_PATTERN)
        return updated_program or program
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.delete("/{program_id}")
async def delete_program(program_id: int, current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    try:
        program = select_one("programs", filters={"id": f"eq.{program_id}"})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not program:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PROGRAM_NOT_FOUND)

    try:
        update_row("programs", {"is_active": False}, filters={"id": f"eq.{program_id}"})
        cache_manager.clear_pattern(PROGRAMS_CACHE_PATTERN)
        cache_manager.clear_pattern(SCHEDULES_CACHE_PATTERN)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return {"message": "Program deactivated successfully"}


@router.get("/stats/summary")
async def get_program_stats(current_user: CurrentUser):
    if current_user.get("user_type") not in {"admin", "supervisor"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    try:
        active_programs = select_rows("programs", filters={"is_active": FILTER_TRUE}, select="id,type,hours")
        total_programs = count_rows("programs", filters={"is_active": FILTER_TRUE})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    institution_programs = sum(1 for program in active_programs if program.get("type") == "Institution-Based")
    community_programs = sum(1 for program in active_programs if program.get("type") == "Community-Based")
    microcredential_programs = sum(1 for program in active_programs if program.get("type") == "Microcredential")
    total_hours = sum(program.get("hours") or 0 for program in active_programs)

    return {
        "total_programs": total_programs,
        "institution_programs": institution_programs,
        "community_programs": community_programs,
        "microcredential_programs": microcredential_programs,
        "total_hours": total_hours,
    }
