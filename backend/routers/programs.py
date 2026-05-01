from typing import Annotated, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status, Query

from .auth import get_current_user
from ..schemas import ProgramCreate, ProgramResponse, ProgramUpdate
from ..supabase_rest import SupabaseAPIError, count_rows, insert_row, select_one, select_rows, update_row
from ..cache_manager import cache_manager

router = APIRouter()

ADMIN_ACCESS_DENIED = "Access denied. Admin access required."
PROGRAM_NOT_FOUND = "Program not found"
CurrentUser = Annotated[dict, Depends(get_current_user)]

# Supabase filter constants
FILTER_TRUE = "eq.true"
ORDER_DESC = "created_at.desc"


def raise_supabase_http(exc: SupabaseAPIError):
    status_code = exc.status_code if 400 <= exc.status_code < 600 else status.HTTP_500_INTERNAL_SERVER_ERROR
    raise HTTPException(status_code=status_code, detail=exc.message) from exc


@router.get("/", response_model=Dict[str, Any])
async def get_programs(
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    search: str = Query(None)
):
    """Get paginated programs with optional search and caching"""
    cache_key = cache_manager.get_cache_key("programs", skip=skip, limit=limit, search=search)
    
    # Try to get from cache
    cached = cache_manager.get(cache_key)
    if cached:
        return cached
    
    try:
        filters = {"is_active": FILTER_TRUE}
        all_programs = select_rows("programs", filters=filters, order=ORDER_DESC)
        
        # Apply search filter if provided
        if search:
            all_programs = [
                p for p in all_programs
                if search.lower() in p.get("name", "").lower()
                or search.lower() in p.get("description", "").lower()
            ]
        
        total = len(all_programs)
        programs = all_programs[skip:skip + limit]
        
        response = {
            "data": programs,
            "total": total,
            "skip": skip,
            "limit": limit,
            "has_more": (skip + limit) < total
        }
        
        # Cache the result
        cache_manager.set(cache_key, response)
        return response
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.post("/", response_model=ProgramResponse)
async def create_program(program_data: ProgramCreate, current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    # Calculate days based on schedule and hours (if hours is provided)
    schedule = program_data.schedule or "8 Hours/Day"
    hours = program_data.hours or 0
    hours_per_day = 8 if schedule == "8 Hours/Day" else 4
    days = hours // hours_per_day if hours_per_day > 0 and hours > 0 else None

    payload = {
        "name": program_data.name,
        "description": program_data.description,
        "type": program_data.type.value,
        "hours": hours if hours > 0 else None,
        "schedule": schedule,
        "days": days,
        "created_by": current_user["id"],
        "is_active": True,
    }

    try:
        result = insert_row("programs", payload)
        # Invalidate cache
        cache_manager.clear_pattern("programs:*")
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
    
    # Recalculate days if hours or schedule changed
    hours = update_data.get("hours", program.get("hours"))
    schedule = update_data.get("schedule", program.get("schedule"))
    
    if hours and schedule:
        hours_per_day = 8 if schedule == "8 Hours/Day" else 4
        update_data["days"] = hours // hours_per_day if hours_per_day > 0 else 0
    elif hours and not schedule:
        # Use existing schedule or default
        existing_schedule = program.get("schedule", "8 Hours/Day")
        hours_per_day = 8 if existing_schedule == "8 Hours/Day" else 4
        update_data["days"] = hours // hours_per_day if hours_per_day > 0 else 0

    try:
        updated_program = update_row("programs", update_data, filters={"id": f"eq.{program_id}"})
        # Invalidate cache
        cache_manager.clear_pattern("programs:*")
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
        # Invalidate cache
        cache_manager.clear_pattern("programs:*")
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return {"message": "Program deactivated successfully"}


@router.get("/stats/summary")
async def get_program_stats(current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    try:
        active_programs = select_rows("programs", filters={"is_active": FILTER_TRUE}, select="id,type,hours")
        total_programs = count_rows("programs", filters={"is_active": FILTER_TRUE})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    institution_programs = sum(1 for program in active_programs if program.get("type") == "Institution")
    community_programs = sum(1 for program in active_programs if program.get("type") == "Community-Based")
    other_programs = sum(1 for program in active_programs if program.get("type") == "Others")
    total_hours = sum(program.get("hours") or 0 for program in active_programs)

    return {
        "total_programs": total_programs,
        "institution_programs": institution_programs,
        "community_programs": community_programs,
        "other_programs": other_programs,
        "total_hours": total_hours,
    }
