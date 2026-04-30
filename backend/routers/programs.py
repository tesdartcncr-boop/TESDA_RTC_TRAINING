from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status

from routers.auth import get_current_user
from schemas import ProgramCreate, ProgramResponse, ProgramUpdate
from supabase_rest import SupabaseAPIError, count_rows, insert_row, select_one, select_rows, update_row

router = APIRouter()

ADMIN_ACCESS_DENIED = "Access denied. Admin access required."
PROGRAM_NOT_FOUND = "Program not found"
CurrentUser = Annotated[dict, Depends(get_current_user)]


def raise_supabase_http(exc: SupabaseAPIError):
    status_code = exc.status_code if 400 <= exc.status_code < 600 else status.HTTP_500_INTERNAL_SERVER_ERROR
    raise HTTPException(status_code=status_code, detail=exc.message) from exc


@router.get("/", response_model=List[ProgramResponse])
async def get_programs(current_user: CurrentUser):
    try:
        return select_rows("programs", filters={"is_active": "eq.true"}, order="created_at.desc")
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.post("/", response_model=ProgramResponse)
async def create_program(program_data: ProgramCreate, current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    payload = {
        "name": program_data.name,
        "description": program_data.description,
        "type": program_data.type.value,
        "hours": program_data.hours,
        "created_by": current_user["id"],
        "is_active": True,
    }

    try:
        return insert_row("programs", payload)
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

    try:
        updated_program = update_row("programs", update_data, filters={"id": f"eq.{program_id}"})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return updated_program or program


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
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return {"message": "Program deactivated successfully"}


@router.get("/stats/summary")
async def get_program_stats(current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    try:
        active_programs = select_rows("programs", filters={"is_active": "eq.true"}, select="id,type,hours")
        total_programs = count_rows("programs", filters={"is_active": "eq.true"})
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
