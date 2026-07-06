from collections import Counter
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .auth import get_current_user
from ..cache_manager import cache_manager
from ..schemas import ProgramCreate, ProgramResponse, ProgramTypeCreate, ProgramTypeResponse, ProgramUpdate
from ..supabase_rest import SupabaseAPIError, count_rows, delete_rows, get_public_error_message, insert_row, select_one, select_rows, update_row
from ..socket_manager import broadcast_program_update, broadcast_schedule_update

router = APIRouter()

ADMIN_ACCESS_DENIED = "Access denied. Admin access required."
PROGRAM_NOT_FOUND = "Program not found"
PROGRAMS_CACHE_PATTERN = "programs:*"
SCHEDULES_CACHE_PATTERN = "schedules:*"
TEACHING_LOADS_SUMMARY_CACHE_PATTERN = "teaching_loads_summary:*"
DEFAULT_SCHEDULE_LABEL = "8 Hours/Day"
CurrentUser = Annotated[dict, Depends(get_current_user)]
FILTER_TRUE = "eq.true"
ORDER_NAME_ASC = "name.asc"
DEFAULT_PROGRAM_TYPES = [
    "Institution-Based",
    "Community-Based",
    "Microcredential",
]


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


def load_active_program_types() -> list[dict[str, Any]]:
    try:
        program_types = select_rows(
            "program_types",
            filters={"is_active": FILTER_TRUE},
            order="name.asc",
            select="id,name,is_active,created_at",
        )
    except SupabaseAPIError:
        program_types = []

    if program_types:
        return program_types

    return [
        {"id": index + 1, "name": name, "is_active": True, "created_at": None}
        for index, name in enumerate(DEFAULT_PROGRAM_TYPES)
    ]


def validate_program_type(program_type: str):
    active_types = {item["name"] for item in load_active_program_types()}
    if program_type not in active_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid program type")


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
            filters["or"] = f"(name.ilike.%{search}%,description.ilike.%{search}%,type.ilike.%{search}%,recognition_number.ilike.%{search}%)"

        total = count_rows("programs", filters=filters)
        
        # Fetch paginated results directly from database
        programs = select_rows(
            "programs",
            filters=filters,
            order=ORDER_NAME_ASC,
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

    validate_program_type(program_data.type)

    payload = normalize_program_payload(
        {
            "name": program_data.name,
            "description": program_data.description,
            "type": program_data.type,
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
        cache_manager.clear_pattern(TEACHING_LOADS_SUMMARY_CACHE_PATTERN)
        await broadcast_program_update(
            {
                "event_type": "program_created",
                "program_id": result.get("id"),
                "data": result,
            }
        )
        return result
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/{program_id:int}", response_model=ProgramResponse)
async def get_program(program_id: int, current_user: CurrentUser):
    try:
        program = select_one("programs", filters={"id": f"eq.{program_id}"})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not program:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PROGRAM_NOT_FOUND)
    return program


@router.put("/{program_id:int}", response_model=ProgramResponse)
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
        validate_program_type(update_data["type"])

    update_data = normalize_program_payload({**program, **update_data})
    for internal_field in ("id", "created_at", "created_by", "updated_at", "is_active"):
        update_data.pop(internal_field, None)

    if "is_active" in program_data.dict(exclude_unset=True):
        update_data["is_active"] = program_data.is_active

    try:
        updated_program = update_row("programs", update_data, filters={"id": f"eq.{program_id}"})
        cache_manager.clear_pattern(PROGRAMS_CACHE_PATTERN)
        cache_manager.clear_pattern(SCHEDULES_CACHE_PATTERN)
        cache_manager.clear_pattern(TEACHING_LOADS_SUMMARY_CACHE_PATTERN)
        await broadcast_program_update(
            {
                "event_type": "program_updated",
                "program_id": program_id,
                "data": updated_program or {**program, **update_data, "id": program_id},
            }
        )
        return updated_program or program
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.delete("/{program_id:int}")
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
        # Capture every assignment affected by this program so we can delete and notify them all.
        affected_assignments = select_rows(
            "trainer_programs",
            filters={"program_id": f"eq.{program_id}"},
            select="id,trainer_id,program_id,approval_status",
        )
        affected_trainer_ids = {row.get("trainer_id") for row in affected_assignments if row.get("trainer_id") is not None}

        # Delete schedules and assignments for the program regardless of approval state.
        delete_rows("schedules", filters={"program_id": f"eq.{program_id}"}, returning="minimal")
        delete_rows("trainer_programs", filters={"program_id": f"eq.{program_id}"}, returning="minimal")
        # Also remove trainer qualifications tied to this program
        delete_rows("trainer_qualifications", filters={"program_id": f"eq.{program_id}"}, returning="minimal")
        # Finally remove the program record
        delete_rows("programs", filters={"id": f"eq.{program_id}"}, returning="minimal")

        # Clear related caches
        cache_manager.clear_pattern(PROGRAMS_CACHE_PATTERN)
        cache_manager.clear_pattern(SCHEDULES_CACHE_PATTERN)
        cache_manager.clear_pattern("schedules_trainer_programs:*")
        cache_manager.clear_pattern("schedules_schedule:*")
        cache_manager.clear_pattern("trainer_programs:*")
        cache_manager.clear_pattern("trainer_schedule:*")
        cache_manager.clear_pattern("teaching_loads_summary:*")
        cache_manager.clear_pattern("trainer_qualifications:*")
        cache_manager.clear_pattern("admin_history:*")

        # Broadcast program deletion and schedule updates
        await broadcast_program_update({
            "event_type": "program_deleted",
            "program_id": program_id,
            "data": {
                "id": program_id,
                "name": program.get("name"),
            },
        })

        # Notify management and any affected trainers so their calendars refresh
        await broadcast_schedule_update({
            "event_type": "program_deleted",
            "program_id": program_id,
        })

        if affected_trainer_ids:
            trainers = select_rows(
                "trainers",
                filters={"id": f"in.({','.join(map(str, sorted(affected_trainer_ids)))})"},
                select="id,user_id",
            )
            for t in trainers:
                try:
                    await broadcast_schedule_update({
                        "event_type": "assignment_deleted",
                        "program_id": program_id,
                        "trainer_id": t.get("id"),
                        "trainer_user_id": t.get("user_id"),
                    })
                except Exception:
                    # don't fail the whole operation if a single emit fails
                    pass
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return {"message": "Program deleted successfully"}


@router.get("/stats/summary")
async def get_program_stats(current_user: CurrentUser):
    if current_user.get("user_type") not in {"admin", "supervisor"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    try:
        active_programs = select_rows("programs", filters={"is_active": FILTER_TRUE}, select="id,type,hours")
        program_types = load_active_program_types()
        total_programs = count_rows("programs", filters={"is_active": FILTER_TRUE})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    program_counts = Counter(program.get("type") for program in active_programs if program.get("type"))
    total_hours = sum(program.get("hours") or 0 for program in active_programs)

    return {
        "total_programs": total_programs,
        "program_types": {item["name"]: program_counts.get(item["name"], 0) for item in program_types},
        "total_hours": total_hours,
    }


@router.get("/types", response_model=list[ProgramTypeResponse])
async def get_program_types(current_user: CurrentUser):
    if current_user.get("user_type") not in {"admin", "supervisor"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    return load_active_program_types()


@router.post("/types", response_model=ProgramTypeResponse)
async def create_program_type(payload: ProgramTypeCreate, current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Program type name is required")

    try:
        existing = select_one("program_types", filters={"name": f"eq.{name}"})
        if existing:
            if existing.get("is_active"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Program type already exists")
            updated = update_row(
                "program_types",
                {"is_active": True},
                filters={"id": f"eq.{existing['id']}"},
            )
            cache_manager.clear_pattern(PROGRAMS_CACHE_PATTERN)
            cache_manager.clear_pattern(TEACHING_LOADS_SUMMARY_CACHE_PATTERN)
            return updated or existing

        created = insert_row(
            "program_types",
            {
                "name": name,
                "is_active": True,
                "created_by": current_user["id"],
            },
        )
        cache_manager.clear_pattern(PROGRAMS_CACHE_PATTERN)
        cache_manager.clear_pattern(TEACHING_LOADS_SUMMARY_CACHE_PATTERN)
        return created
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.delete("/types/{type_id}")
async def deactivate_program_type(type_id: int, current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    try:
        program_type = select_one("program_types", filters={"id": f"eq.{type_id}"})
        if not program_type:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Program type not found")

        update_row("program_types", {"is_active": False}, filters={"id": f"eq.{type_id}"})
        cache_manager.clear_pattern(PROGRAMS_CACHE_PATTERN)
        cache_manager.clear_pattern(TEACHING_LOADS_SUMMARY_CACHE_PATTERN)
        return {"message": "Program type deactivated successfully"}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
