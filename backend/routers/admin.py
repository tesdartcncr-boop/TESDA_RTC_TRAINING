from datetime import datetime
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status

from .auth import get_current_user
from ..schemas import NotificationCreate, NotificationResponse
from ..supabase_rest import SupabaseAPIError, count_rows, insert_row, select_one, select_rows, update_row

router = APIRouter()

ADMIN_ACCESS_DENIED = "Access denied. Admin access required."
CurrentUser = Annotated[dict, Depends(get_current_user)]

# Supabase filter constants
FILTER_TRUE = "eq.true"
ORDER_DESC = "created_at.desc"


def raise_supabase_http(exc: SupabaseAPIError):
    status_code = exc.status_code if 400 <= exc.status_code < 600 else status.HTTP_500_INTERNAL_SERVER_ERROR
    raise HTTPException(status_code=status_code, detail=exc.message) from exc


def format_date(value):
    if not value:
        return ""
    if isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.strftime("%Y-%m-%d")
    return value.strftime("%Y-%m-%d")


@router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    try:
        total_trainers = count_rows("trainers", filters={"is_active": FILTER_TRUE})
        total_programs = count_rows("programs", filters={"is_active": FILTER_TRUE})
        active_programs = select_rows("programs", filters={"is_active": FILTER_TRUE}, select="hours")
        recent_trainers = select_rows(
            "trainers",
            filters={"is_active": FILTER_TRUE},
            order=ORDER_DESC,
            limit=5,
        )
        recent_programs = select_rows(
            "programs",
            filters={"is_active": FILTER_TRUE},
            order=ORDER_DESC,
            limit=5,
        )
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return {
        "total_trainers": total_trainers,
        "total_programs": total_programs,
        "total_hours": sum(program.get("hours") or 0 for program in active_programs),
        "recent_trainers": recent_trainers,
        "recent_programs": recent_programs,
    }


@router.get("/notifications", response_model=List[NotificationResponse])
async def get_notifications(current_user: CurrentUser):
    try:
        return select_rows(
            "notifications",
            filters={"user_id": f"eq.{current_user['id']}"},
            order=ORDER_DESC,
        )
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.post("/notifications", response_model=NotificationResponse)
async def create_notification(notification_data: NotificationCreate, current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    try:
        return insert_row(
            "notifications",
            {
                "user_id": notification_data.user_id,
                "title": notification_data.title,
                "message": notification_data.message,
                "is_read": False,
            },
        )
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: int, current_user: CurrentUser):
    try:
        notification = select_one(
            "notifications",
            filters={
                "id": f"eq.{notification_id}",
                "user_id": f"eq.{current_user['id']}",
            },
        )
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    try:
        update_row(
            "notifications",
            {"is_read": True},
            filters={"id": f"eq.{notification_id}"},
        )
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return {"message": "Notification marked as read"}


@router.get("/trainers/export")
async def export_trainers(current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    try:
        trainers = select_rows("trainers", filters={"is_active": FILTER_TRUE}, order=ORDER_DESC)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    export_data = []
    for trainer in trainers:
        export_data.append(
            {
                "ID": trainer.get("id"),
                "Username": trainer.get("username"),
                "Name": trainer.get("trainer_name"),
                "Qualifications": trainer.get("qualifications") or "",
                "TM Number": trainer.get("tm_number") or "",
                "TM Expiration": format_date(trainer.get("tm_expiration")),
                "NTTC Number": trainer.get("nttc_number") or "",
                "NTTC Expiration": format_date(trainer.get("nttc_expiration")),
                "Created": format_date(trainer.get("created_at")),
            }
        )

    return {"data": export_data}


@router.get("/programs/export")
async def export_programs(current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    try:
        programs = select_rows("programs", filters={"is_active": FILTER_TRUE}, order=ORDER_DESC)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    export_data = []
    for program in programs:
        export_data.append(
            {
                "ID": program.get("id"),
                "Name": program.get("name"),
                "Description": program.get("description") or "",
                "Type": program.get("type"),
                "Hours": program.get("hours"),
                "Created": format_date(program.get("created_at")),
            }
        )

    return {"data": export_data}
