from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .auth import get_current_user
from ..cache_manager import cache_manager
from ..schedule_utils import (
    VALID_HOURS_PER_DAY,
    VALID_STATUSES,
    build_assignment_summary,
    load_schedule_rows,
    sync_assignment_schedule,
)
from ..schemas import ScheduleHoursUpdate, ScheduleUpdate, TeachingLoadApprovalUpdate
from ..socket_manager import broadcast_schedule_update, send_notification_to_user
from ..supabase_rest import SupabaseAPIError, delete_rows, select_one, select_rows, update_row

router = APIRouter()

SCHEDULES_CACHE_PATTERN = "schedules:*"
CurrentUser = Annotated[dict, Depends(get_current_user)]


def get_trainer_programs_cache_key(trainer_id: int) -> str:
    return cache_manager.get_cache_key("schedules_trainer_programs", trainer_id=trainer_id)


def get_schedule_cache_key(trainer_id: int, program_id: int) -> str:
    return cache_manager.get_cache_key("schedules_schedule", trainer_id=trainer_id, program_id=program_id)


def clear_schedule_caches():
    cache_manager.clear_pattern(SCHEDULES_CACHE_PATTERN)
    cache_manager.clear_pattern("schedules_trainer_programs:*")
    cache_manager.clear_pattern("schedules_schedule:*")
    cache_manager.clear_pattern("trainer_schedule:*")
    cache_manager.clear_pattern("trainer_programs:*")


def raise_supabase_http(exc: SupabaseAPIError):
    status_code = exc.status_code if 400 <= exc.status_code < 600 else status.HTTP_500_INTERNAL_SERVER_ERROR
    raise HTTPException(status_code=status_code, detail=exc.message) from exc


def get_trainer_or_404(trainer_id: int) -> dict:
    trainer = select_one("trainers", filters={"id": f"eq.{trainer_id}"})
    if not trainer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trainer not found")
    return trainer


def get_assignment_or_404(trainer_id: int, program_id: int) -> tuple[dict, dict, dict]:
    trainer = get_trainer_or_404(trainer_id)
    assignment = select_one(
        "trainer_programs",
        filters={
            "trainer_id": f"eq.{trainer_id}",
            "program_id": f"eq.{program_id}",
        },
    )
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned schedule not found")

    program = select_one("programs", filters={"id": f"eq.{program_id}"})
    if not program:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Program not found")

    return trainer, assignment, program


def ensure_management_role(current_user: dict):
    if current_user.get("user_type") not in {"admin", "supervisor"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")


def ensure_assignment_view_access(current_user: dict, trainer: dict, assignment: dict):
    if current_user.get("user_type") in {"admin", "supervisor"}:
        return

    if trainer.get("username") != current_user.get("username"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    if assignment.get("approval_status") != "approved":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teaching load is not approved yet.")


def ensure_assignment_edit_access(current_user: dict, trainer: dict, assignment: dict):
    if current_user.get("user_type") == "admin":
        return

    if current_user.get("user_type") != "trainer" or trainer.get("username") != current_user.get("username"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    if assignment.get("approval_status") != "approved":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teaching load is not approved yet.")


@router.get("/trainer/{trainer_id}/programs")
async def get_trainer_programs_schedules(
    trainer_id: int,
    current_user: CurrentUser,
    approval_status: str | None = Query(None),
) -> list:
    try:
        trainer = get_trainer_or_404(trainer_id)
        cache_key = get_trainer_programs_cache_key(trainer_id)
        cached = cache_manager.get(cache_key)
        if cached is not None and approval_status is None:
            if current_user.get("user_type") == "trainer":
                return [row for row in cached if row.get("approval_status") == "approved"]
            return cached

        filters = {"trainer_id": f"eq.{trainer_id}"}
        if approval_status:
            filters["approval_status"] = f"eq.{approval_status}"

        assignments = select_rows(
            table="trainer_programs",
            filters=filters,
            order="created_at.desc",
        )

        result = []
        for assignment in assignments:
            program = select_one("programs", filters={"id": f"eq.{assignment['program_id']}"})
            if not program:
                continue
            ensure_assignment_view_access(current_user, trainer, assignment)
            synced_rows = sync_assignment_schedule(assignment, program)
            result.append(build_assignment_summary(trainer, assignment, program, synced_rows))

        if approval_status is None:
            cache_manager.set(cache_key, result)
        return result
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/trainer/{trainer_id}/program/{program_id}/schedule")
async def get_schedule_for_trainer_program(trainer_id: int, program_id: int, current_user: CurrentUser) -> list:
    try:
        trainer, assignment, program = get_assignment_or_404(trainer_id, program_id)
        ensure_assignment_view_access(current_user, trainer, assignment)

        cache_key = get_schedule_cache_key(trainer_id, program_id)
        cached = cache_manager.get(cache_key)
        if cached is not None:
            return cached

        synced_rows = sync_assignment_schedule(assignment, program)
        cache_manager.set(cache_key, synced_rows)
        return synced_rows
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/trainer/{trainer_id}/program/{program_id}/day/{day_number}")
async def create_or_update_schedule_day(
    trainer_id: int,
    program_id: int,
    day_number: int,
    request: ScheduleUpdate,
    current_user: CurrentUser,
) -> dict[str, Any]:
    if day_number <= 0:
        raise HTTPException(status_code=400, detail="day_number must be greater than 0")

    if request.hours_per_day not in VALID_HOURS_PER_DAY:
        raise HTTPException(status_code=400, detail="hours_per_day must be 4 or 8")

    if request.status and request.status.value not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status value")

    try:
        trainer, assignment, program = get_assignment_or_404(trainer_id, program_id)
        ensure_assignment_edit_access(current_user, trainer, assignment)

        existing_rows = sync_assignment_schedule(assignment, program)
        existing = next((row for row in existing_rows if int(row.get("day_number") or 0) == day_number), None)
        if not existing:
            synced_again = sync_assignment_schedule(assignment, program)
            existing = next((row for row in synced_again if int(row.get("day_number") or 0) == day_number), None)
        if not existing:
            raise HTTPException(status_code=404, detail="Schedule day not found")

        payload = {
            "hours_per_day": request.hours_per_day,
            "status": request.status.value if request.status else None,
            "updated_at": datetime.now().isoformat(),
        }
        if request.schedule_date is not None:
            payload["schedule_date"] = request.schedule_date
        if request.notes is not None:
            payload["notes"] = request.notes

        result = update_row("schedules", payload, filters={"id": f"eq.{existing['id']}"}) or existing
        synced_rows = sync_assignment_schedule(assignment, program)
        clear_schedule_caches()
        cache_manager.set(get_schedule_cache_key(trainer_id, program_id), synced_rows)
        cache_manager.clear_pattern("trainer_schedule:.*")

        await broadcast_schedule_update(
            {
                "event_type": "day_updated",
                "trainer_id": trainer_id,
                "program_id": program_id,
                "day_number": day_number,
                "data": result,
            }
        )

        return {"status": "updated", "data": result}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.put("/trainer/{trainer_id}/program/{program_id}/hours-per-day")
async def update_assignment_hours_per_day(
    trainer_id: int,
    program_id: int,
    request: ScheduleHoursUpdate,
    current_user: CurrentUser,
) -> dict[str, Any]:
    if request.hours_per_day not in VALID_HOURS_PER_DAY:
        raise HTTPException(status_code=400, detail="hours_per_day must be 4 or 8")

    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Admin access required.")

    try:
        trainer, assignment, program = get_assignment_or_404(trainer_id, program_id)
        updated_assignment = update_row(
            "trainer_programs",
            {
                "hours_per_day": request.hours_per_day,
                "updated_at": datetime.now().isoformat(),
            },
            filters={"id": f"eq.{assignment['id']}"},
        ) or assignment

        synced_rows = sync_assignment_schedule(updated_assignment, program)
        clear_schedule_caches()
        summary = build_assignment_summary(trainer, updated_assignment, program, synced_rows)
        cache_manager.clear_pattern("trainer_schedule:.*")

        await broadcast_schedule_update(
            {
                "event_type": "hours_per_day_updated",
                "trainer_id": trainer_id,
                "program_id": program_id,
                "hours_per_day": request.hours_per_day,
                "data": summary,
            }
        )
        return summary
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/approval-queue")
async def get_approval_queue(current_user: CurrentUser, approval_status: str | None = Query(None)):
    ensure_management_role(current_user)

    try:
        filters = {}
        if approval_status:
            filters["approval_status"] = f"eq.{approval_status}"

        assignments = select_rows("trainer_programs", filters=filters, order="created_at.desc")
        queue = []
        for assignment in assignments:
            trainer = select_one("trainers", filters={"id": f"eq.{assignment['trainer_id']}"})
            program = select_one("programs", filters={"id": f"eq.{assignment['program_id']}"})
            if not trainer or not program:
                continue
            synced_rows = sync_assignment_schedule(assignment, program)
            queue.append(build_assignment_summary(trainer, assignment, program, synced_rows))
        return queue
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.put("/trainer/{trainer_id}/program/{program_id}/approval")
async def update_assignment_approval(
    trainer_id: int,
    program_id: int,
    payload: TeachingLoadApprovalUpdate,
    current_user: CurrentUser,
) -> dict[str, Any]:
    ensure_management_role(current_user)

    try:
        trainer, assignment, program = get_assignment_or_404(trainer_id, program_id)
        update_payload = {
            "approval_status": payload.approval_status.value,
            "approval_notes": payload.approval_notes,
            "approved_by": current_user["id"],
            "approved_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }
        updated_assignment = update_row(
            "trainer_programs",
            update_payload,
            filters={"id": f"eq.{assignment['id']}"},
        ) or assignment
        synced_rows = sync_assignment_schedule(updated_assignment, program)
        clear_schedule_caches()
        summary = build_assignment_summary(trainer, updated_assignment, program, synced_rows)
        cache_manager.clear_pattern("trainer_schedule:.*")

        message = (
            f"{program['name']} has been approved."
            if payload.approval_status.value == "approved"
            else f"{program['name']} has been rejected."
        )
        await send_notification_to_user(trainer["user_id"], "Teaching Load Update", message)
        await broadcast_schedule_update(
            {
                "event_type": "assignment_approval_updated",
                "trainer_id": trainer_id,
                "program_id": program_id,
                "data": summary,
            }
        )
        return summary
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.post("/trainer/{trainer_id}/program/{program_id}/batch")
async def batch_create_schedules(trainer_id: int, program_id: int, current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Admin access required.")

    try:
        _trainer, assignment, program = get_assignment_or_404(trainer_id, program_id)
        synced_rows = sync_assignment_schedule(assignment, program)
        clear_schedule_caches()
        return {"status": "synced", "count": len(synced_rows), "data": synced_rows}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.delete("/schedule/{schedule_id}")
async def delete_schedule_entry(schedule_id: int, current_user: CurrentUser) -> dict[str, Any]:
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Admin access required.")

    try:
        delete_rows("schedules", filters={"id": f"eq.{schedule_id}"}, returning="minimal")
        clear_schedule_caches()
        cache_manager.clear_pattern("trainer_schedule:.*")
        return {"status": "deleted"}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.delete("/trainer/{trainer_id}/program/{program_id}/assignment")
async def delete_trainer_program_assignment(trainer_id: int, program_id: int, current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Admin access required.")

    try:
        _trainer, assignment, _program = get_assignment_or_404(trainer_id, program_id)
        deleted_schedules = delete_rows(
            "schedules",
            filters={
                "trainer_id": f"eq.{trainer_id}",
                "program_id": f"eq.{program_id}",
            },
        )
        delete_rows(
            "trainer_programs",
            filters={
                "trainer_id": f"eq.{trainer_id}",
                "program_id": f"eq.{program_id}",
            },
        )
        clear_schedule_caches()
        cache_manager.clear_pattern("trainer_schedule:.*")

        await broadcast_schedule_update(
            {
                "event_type": "assignment_deleted",
                "trainer_id": trainer_id,
                "program_id": program_id,
            }
        )

        return {
            "status": "deleted",
            "assignment_id": assignment["id"],
            "deleted_schedule_rows": len(deleted_schedules or []),
        }
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
