import math
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, status

from backend.schemas import ScheduleHoursUpdate, ScheduleUpdate
from backend.socket_manager import broadcast_schedule_update
from backend.supabase_rest import (
    SupabaseAPIError,
    delete_rows,
    insert_row,
    select_one,
    select_rows,
    update_row,
    update_rows,
)

router = APIRouter()

DEFAULT_HOURS_PER_DAY = 8
DAY_SETTINGS_MARKER = 0
VALID_HOURS_PER_DAY = {4, 8}
VALID_STATUSES = {"complete", "absent", "suspended", "leave"}


def raise_supabase_http(exc: SupabaseAPIError):
    status_code = exc.status_code if 400 <= exc.status_code < 600 else status.HTTP_500_INTERNAL_SERVER_ERROR
    raise HTTPException(status_code=status_code, detail=exc.message) from exc


def hours_per_day_to_label(hours_per_day: int) -> str:
    return f"{hours_per_day} Hours/Day"


def get_program_base_hours(program: dict[str, Any]) -> int:
    return 4 if program.get("schedule") == "4 Hours/Day" else DEFAULT_HOURS_PER_DAY


def get_program_total_hours(program: dict[str, Any]) -> int:
    hours = program.get("hours")
    if hours not in (None, ""):
        try:
            return int(hours)
        except (TypeError, ValueError):
            pass

    days = program.get("days") or 0
    try:
        return int(days) * get_program_base_hours(program)
    except (TypeError, ValueError):
        return 0


def get_saved_hours_per_day(trainer_id: int, program_id: int, fallback_hours: int) -> int:
    settings_row = select_one(
        "schedules",
        filters={
            "trainer_id": f"eq.{trainer_id}",
            "program_id": f"eq.{program_id}",
            "day_number": f"eq.{DAY_SETTINGS_MARKER}",
        },
    )
    saved_hours = settings_row.get("hours_per_day") if settings_row else None
    return saved_hours if saved_hours in VALID_HOURS_PER_DAY else fallback_hours


def get_effective_program_days(program: dict[str, Any], hours_per_day: int) -> int:
    total_hours = get_program_total_hours(program)
    if total_hours > 0:
        return math.ceil(total_hours / hours_per_day)

    try:
        return int(program.get("days") or 0)
    except (TypeError, ValueError):
        return 0


def build_program_summary(
    trainer_id: int,
    assignment: dict[str, Any],
    program: dict[str, Any],
) -> dict[str, Any]:
    default_hours = get_program_base_hours(program)
    hours_per_day = get_saved_hours_per_day(trainer_id, assignment["program_id"], default_hours)
    total_hours = get_program_total_hours(program)

    return {
        "id": assignment["id"],
        "trainer_id": trainer_id,
        "program_id": program["id"],
        "program_name": program.get("name"),
        "program_type": program.get("type"),
        "program_days": get_effective_program_days(program, hours_per_day),
        "base_program_days": program.get("days") or 0,
        "program_total_hours": total_hours,
        "program_schedule": hours_per_day_to_label(hours_per_day),
        "hours_per_day": hours_per_day,
        "schedule_date": assignment.get("schedule_date"),
        "created_at": assignment.get("created_at"),
    }


def ensure_assignment_context(trainer_id: int, program_id: int):
    assignment_filters = {
        "trainer_id": f"eq.{trainer_id}",
        "program_id": f"eq.{program_id}",
    }
    assignment = select_one("trainer_programs", filters=assignment_filters)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned schedule not found")

    program = select_one("programs", filters={"id": f"eq.{program_id}"})
    if not program:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Program not found")

    return assignment, program


def upsert_schedule_settings(trainer_id: int, program_id: int, hours_per_day: int):
    now = datetime.now().isoformat()
    settings_filters = {
        "trainer_id": f"eq.{trainer_id}",
        "program_id": f"eq.{program_id}",
        "day_number": f"eq.{DAY_SETTINGS_MARKER}",
    }
    existing_settings = select_one("schedules", filters=settings_filters)

    settings_payload = {
        "hours_per_day": hours_per_day,
        "updated_at": now,
    }

    if existing_settings:
        return update_row("schedules", settings_payload, filters=settings_filters) or existing_settings

    settings_payload.update(
        {
            "trainer_id": trainer_id,
            "program_id": program_id,
            "day_number": DAY_SETTINGS_MARKER,
            "created_at": now,
        }
    )
    return insert_row("schedules", settings_payload)


@router.get("/trainer/{trainer_id}/programs", responses={500: {"description": "Database query failed"}})
async def get_trainer_programs_schedules(trainer_id: int) -> list:
    try:
        assignments = select_rows(
            table="trainer_programs",
            filters={"trainer_id": f"eq.{trainer_id}"},
            order="created_at.desc",
        )

        result = []
        for assignment in assignments:
            program = select_one("programs", filters={"id": f"eq.{assignment['program_id']}"})
            if program:
                result.append(build_program_summary(trainer_id, assignment, program))

        return result
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/trainer/{trainer_id}/program/{program_id}/schedule", responses={500: {"description": "Database query failed"}})
async def get_schedule_for_trainer_program(trainer_id: int, program_id: int) -> list:
    try:
        schedules = select_rows(
            table="schedules",
            filters={
                "trainer_id": f"eq.{trainer_id}",
                "program_id": f"eq.{program_id}",
                "day_number": "gt.0",
            },
            order="day_number",
        )
        return schedules or []
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/trainer/{trainer_id}/program/{program_id}/day/{day_number}", responses={400: {"description": "Invalid hours_per_day or status value"}, 500: {"description": "Database operation failed"}})
async def create_or_update_schedule_day(
    trainer_id: int,
    program_id: int,
    day_number: int,
    request: ScheduleUpdate,
) -> dict[str, Any]:
    if day_number <= 0:
        raise HTTPException(status_code=400, detail="day_number must be greater than 0")

    if request.hours_per_day not in VALID_HOURS_PER_DAY:
        raise HTTPException(status_code=400, detail="hours_per_day must be 4 or 8")

    if request.status and request.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status value")

    try:
        ensure_assignment_context(trainer_id, program_id)
        upsert_schedule_settings(trainer_id, program_id, request.hours_per_day)

        filters = {
            "trainer_id": f"eq.{trainer_id}",
            "program_id": f"eq.{program_id}",
            "day_number": f"eq.{day_number}",
        }
        existing = select_one("schedules", filters=filters)

        schedule_data = {
            "trainer_id": trainer_id,
            "program_id": program_id,
            "day_number": day_number,
            "hours_per_day": request.hours_per_day,
            "status": request.status,
            "updated_at": datetime.now().isoformat(),
        }

        if request.schedule_date is not None:
            schedule_data["schedule_date"] = request.schedule_date
        if request.notes is not None:
            schedule_data["notes"] = request.notes

        if existing:
            result = update_row("schedules", schedule_data, filters=filters)
            operation = "updated"
        else:
            schedule_data["created_at"] = datetime.now().isoformat()
            result = insert_row("schedules", schedule_data)
            operation = "created"

        try:
            await broadcast_schedule_update(
                {
                    "trainer_id": trainer_id,
                    "program_id": program_id,
                    "day_number": day_number,
                    "data": result,
                }
            )
        except Exception:
            pass

        return {"status": operation, "data": result}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.put("/trainer/{trainer_id}/program/{program_id}/hours-per-day", responses={400: {"description": "Invalid hours_per_day value"}, 500: {"description": "Database operation failed"}})
async def update_assignment_hours_per_day(
    trainer_id: int,
    program_id: int,
    request: ScheduleHoursUpdate,
) -> dict[str, Any]:
    if request.hours_per_day not in VALID_HOURS_PER_DAY:
        raise HTTPException(status_code=400, detail="hours_per_day must be 4 or 8")

    try:
        assignment, program = ensure_assignment_context(trainer_id, program_id)
        upsert_schedule_settings(trainer_id, program_id, request.hours_per_day)
        update_rows(
            "schedules",
            {
                "hours_per_day": request.hours_per_day,
                "updated_at": datetime.now().isoformat(),
            },
            filters={
                "trainer_id": f"eq.{trainer_id}",
                "program_id": f"eq.{program_id}",
                "day_number": "gt.0",
            },
        )

        return build_program_summary(trainer_id, assignment, program)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/trainer/{trainer_id}/program/{program_id}/batch", responses={500: {"description": "Database operation failed"}})
async def batch_create_schedules(trainer_id: int, program_id: int, days: list[dict]) -> dict[str, Any]:
    try:
        ensure_assignment_context(trainer_id, program_id)

        created = []
        last_hours_per_day = None

        for day in days:
            day_num = day.get("day_number")
            hours = day.get("hours_per_day", DEFAULT_HOURS_PER_DAY)
            date_str = day.get("schedule_date")

            if not isinstance(day_num, int) or day_num <= 0 or hours not in VALID_HOURS_PER_DAY:
                continue

            schedule_data = {
                "trainer_id": trainer_id,
                "program_id": program_id,
                "day_number": day_num,
                "hours_per_day": hours,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
            }

            if date_str:
                schedule_data["schedule_date"] = date_str

            try:
                result = insert_row("schedules", schedule_data)
                created.append(result)
                last_hours_per_day = hours
            except SupabaseAPIError:
                continue

        if last_hours_per_day in VALID_HOURS_PER_DAY:
            upsert_schedule_settings(trainer_id, program_id, last_hours_per_day)

        return {"status": "batch_created", "count": len(created), "data": created}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/schedule/{schedule_id}", responses={500: {"description": "Database operation failed"}})
async def delete_schedule_entry(schedule_id: int) -> dict[str, Any]:
    try:
        delete_rows("schedules", filters={"id": f"eq.{schedule_id}"})
        return {"status": "deleted"}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/trainer/{trainer_id}/program/{program_id}/assignment", responses={404: {"description": "Assigned schedule not found"}, 500: {"description": "Database operation failed"}})
async def delete_trainer_program_assignment(trainer_id: int, program_id: int):
    try:
        assignment, _program = ensure_assignment_context(trainer_id, program_id)

        schedule_filters = {
            "trainer_id": f"eq.{trainer_id}",
            "program_id": f"eq.{program_id}",
        }
        deleted_schedules = delete_rows("schedules", filters=schedule_filters)
        delete_rows(
            "trainer_programs",
            filters={
                "trainer_id": f"eq.{trainer_id}",
                "program_id": f"eq.{program_id}",
            },
        )

        return {
            "status": "deleted",
            "assignment_id": assignment["id"],
            "deleted_schedule_rows": len(deleted_schedules or []),
        }
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
