from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .auth import get_current_user, get_password_hash
from ..schemas import AccountCreate, AccountUpdate, NotificationCreate, NotificationResponse
from ..supabase_rest import SupabaseAPIError, count_rows, insert_row, select_one, select_rows, update_row

router = APIRouter()

ADMIN_ACCESS_DENIED = "Access denied. Admin access required."
CurrentUser = Annotated[dict, Depends(get_current_user)]
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


def utc_now_iso() -> str:
    return datetime.now().isoformat()


def ensure_admin(current_user: dict):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)


def ensure_management_role(current_user: dict):
    if current_user.get("user_type") not in {"admin", "supervisor"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")


@router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: CurrentUser):
    ensure_management_role(current_user)

    try:
        total_trainers = count_rows("trainers", filters={"is_active": FILTER_TRUE})
        total_programs = count_rows("programs", filters={"is_active": FILTER_TRUE})
        total_admin_accounts = count_rows("users", filters={"user_type": "eq.admin", "is_active": FILTER_TRUE})
        total_supervisor_accounts = count_rows("users", filters={"user_type": "eq.supervisor", "is_active": FILTER_TRUE})
        teaching_loads = select_rows("trainer_programs", select="id,approval_status")
        active_programs = select_rows("programs", filters={"is_active": FILTER_TRUE}, select="hours")
        recent_trainers = select_rows("trainers", filters={"is_active": FILTER_TRUE}, order=ORDER_DESC, limit=5)
        recent_programs = select_rows("programs", filters={"is_active": FILTER_TRUE}, order=ORDER_DESC, limit=5)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    pending_loads = sum(1 for load in teaching_loads if load.get("approval_status") == "for approval")
    approved_loads = sum(1 for load in teaching_loads if load.get("approval_status") == "approved")
    rejected_loads = sum(1 for load in teaching_loads if load.get("approval_status") == "rejected")

    return {
        "total_trainers": total_trainers,
        "total_programs": total_programs,
        "total_admin_accounts": total_admin_accounts,
        "total_supervisor_accounts": total_supervisor_accounts,
        "total_teaching_loads": len(teaching_loads),
        "pending_loads": pending_loads,
        "approved_loads": approved_loads,
        "rejected_loads": rejected_loads,
        "total_hours": sum(program.get("hours") or 0 for program in active_programs),
        "recent_trainers": recent_trainers,
        "recent_programs": recent_programs,
    }


@router.get("/statistics/overview")
async def get_statistics_overview(current_user: CurrentUser):
    ensure_management_role(current_user)

    try:
        programs = select_rows("programs", filters={"is_active": FILTER_TRUE}, select="id,type,hours,validity")
        assignments = select_rows("trainer_programs", select="id,approval_status,hours_per_day")
        trainers = select_rows("trainers", filters={"is_active": FILTER_TRUE}, select="id,trainer_type")
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return {
        "program_types": {
            "institution_based": sum(1 for program in programs if program.get("type") == "Institution-Based"),
            "community_based": sum(1 for program in programs if program.get("type") == "Community-Based"),
            "microcredential": sum(1 for program in programs if program.get("type") == "Microcredential"),
        },
        "teaching_loads": {
            "for_approval": sum(1 for row in assignments if row.get("approval_status") == "for approval"),
            "approved": sum(1 for row in assignments if row.get("approval_status") == "approved"),
            "rejected": sum(1 for row in assignments if row.get("approval_status") == "rejected"),
        },
        "trainer_types": {
            "permanent": sum(1 for trainer in trainers if trainer.get("trainer_type") == "Permanent"),
            "jo_oncall": sum(1 for trainer in trainers if trainer.get("trainer_type") == "JO/Oncall"),
        },
        "total_program_hours": sum(program.get("hours") or 0 for program in programs),
    }


@router.get("/notifications", response_model=list[NotificationResponse])
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
    ensure_management_role(current_user)

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
        update_row("notifications", {"is_read": True}, filters={"id": f"eq.{notification_id}"})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return {"message": "Notification marked as read"}


@router.get("/accounts")
async def get_accounts(current_user: CurrentUser, role: str | None = Query(None)):
    ensure_management_role(current_user)

    filters = {"is_active": FILTER_TRUE}
    if current_user.get("user_type") == "supervisor":
        filters["user_type"] = "eq.supervisor"
    elif role:
        filters["user_type"] = f"eq.{role}"
    else:
        filters["user_type"] = "in.(admin,supervisor)"

    try:
        return select_rows("users", filters=filters, order=ORDER_DESC)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.post("/accounts")
async def create_account(payload: AccountCreate, current_user: CurrentUser):
    ensure_admin(current_user)

    if payload.user_type.value not in {"admin", "supervisor"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only admin and supervisor accounts are supported here.")

    try:
        existing_username = select_one("users", filters={"username": f"eq.{payload.username}"}, select="id")
        if existing_username:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")

        existing_email = select_one("users", filters={"email": f"eq.{payload.email}"}, select="id")
        if existing_email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

        return insert_row(
            "users",
            {
                "username": payload.username,
                "email": payload.email,
                "full_name": payload.full_name,
                "password_hash": get_password_hash(payload.password),
                "user_type": payload.user_type.value,
                "is_active": True,
                "created_at": utc_now_iso(),
                "updated_at": utc_now_iso(),
            },
        )
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.put("/accounts/{account_id}")
async def update_account(account_id: int, payload: AccountUpdate, current_user: CurrentUser):
    ensure_management_role(current_user)

    try:
        account = select_one("users", filters={"id": f"eq.{account_id}"})
        if not account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

        if account.get("user_type") not in {"admin", "supervisor"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This endpoint only manages admin and supervisor accounts.")

        if current_user.get("user_type") == "supervisor" and account.get("user_type") != "supervisor":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

        update_data = payload.dict(exclude_unset=True)
        if "password" in update_data and update_data["password"]:
            update_data["password_hash"] = get_password_hash(update_data.pop("password"))
        update_data["updated_at"] = utc_now_iso()

        if current_user.get("user_type") == "supervisor":
            update_data.pop("is_active", None)

        if "email" in update_data:
            existing_email = select_one("users", filters={"email": f"eq.{update_data['email']}"}, select="id")
            if existing_email and int(existing_email["id"]) != int(account_id):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

        return update_row("users", update_data, filters={"id": f"eq.{account_id}"}) or account
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/trainers/export")
async def export_trainers(current_user: CurrentUser):
    ensure_management_role(current_user)

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
    ensure_management_role(current_user)

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
                "Validity": program.get("validity") or "",
                "Hours": program.get("hours"),
                "Created": format_date(program.get("created_at")),
            }
        )

    return {"data": export_data}
