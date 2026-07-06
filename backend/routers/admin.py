from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .auth import get_current_user, get_password_hash
from ..cache_manager import cache_manager
from ..schemas import AccountCreate, AccountUpdate, NotificationCreate, NotificationResponse
from ..supabase_rest import SupabaseAPIError, count_rows, delete_rows, get_public_error_message, insert_row, select_one, select_rows, update_row
from ..schedule_utils import build_assignment_summary, is_expired_date, load_schedule_rows, load_users_map
from ..user_cleanup import delete_user_auth_artifacts, delete_user_messages, reassign_management_history

router = APIRouter()

ADMIN_ACCESS_DENIED = "Access denied. Admin access required."
CurrentUser = Annotated[dict, Depends(get_current_user)]
FILTER_TRUE = "eq.true"
ORDER_DESC = "created_at.desc"


def raise_supabase_http(exc: SupabaseAPIError):
    status_code = exc.status_code if 400 <= exc.status_code < 600 else status.HTTP_500_INTERNAL_SERVER_ERROR
    raise HTTPException(status_code=status_code, detail=get_public_error_message(exc)) from exc


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


def _build_history_rows(records: list[dict], kind: str) -> list[dict]:
    rows = []
    for record in records:
        rows.append({"kind": kind, **record})
    return rows


def get_teaching_loads_summary_cache_key() -> str:
    return cache_manager.get_cache_key(
        "teaching_loads_summary",
        scope="approved",
        cache_day=date.today().isoformat(),
    )


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
        program_types = select_rows("program_types", filters={"is_active": FILTER_TRUE}, select="name")
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return {
        "program_types": {program_type.get("name"): sum(1 for program in programs if program.get("type") == program_type.get("name")) for program_type in program_types},
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


@router.get("/statistics/teaching-loads-by-year")
async def get_teaching_loads_by_year(current_user: CurrentUser, year: int | None = Query(None)):
    ensure_management_role(current_user)

    try:
        # Get all teaching loads with creation date
        teaching_loads = select_rows("trainer_programs", select="id,approval_status,created_at,batch")
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    # Filter by year if provided
    if year:
        filtered_loads = [
            load for load in teaching_loads
            if load.get("created_at") and load["created_at"][:4] == str(year)
        ]
    else:
        filtered_loads = teaching_loads

    # Group by year for overview
    loads_by_year = {}
    for load in teaching_loads:
        if load.get("created_at"):
            load_year = load["created_at"][:4]
            if load_year not in loads_by_year:
                loads_by_year[load_year] = {
                    "total": 0,
                    "for_approval": 0,
                    "approved": 0,
                    "rejected": 0
                }
            
            loads_by_year[load_year]["total"] += 1
            status = load.get("approval_status", "")
            if status == "for approval":
                loads_by_year[load_year]["for_approval"] += 1
            elif status == "approved":
                loads_by_year[load_year]["approved"] += 1
            elif status == "rejected":
                loads_by_year[load_year]["rejected"] += 1

    # Calculate statistics for filtered loads
    total_filtered = len(filtered_loads)
    for_approval_filtered = sum(1 for load in filtered_loads if load.get("approval_status") == "for approval")
    approved_filtered = sum(1 for load in filtered_loads if load.get("approval_status") == "approved")
    rejected_filtered = sum(1 for load in filtered_loads if load.get("approval_status") == "rejected")

    # Group by batch for detailed view
    loads_by_batch = {}
    for load in filtered_loads:
        batch = load.get("batch", "No Batch")
        if batch not in loads_by_batch:
            loads_by_batch[batch] = {
                "total": 0,
                "for_approval": 0,
                "approved": 0,
                "rejected": 0
            }
        
        loads_by_batch[batch]["total"] += 1
        status = load.get("approval_status", "")
        if status == "for approval":
            loads_by_batch[batch]["for_approval"] += 1
        elif status == "approved":
            loads_by_batch[batch]["approved"] += 1
        elif status == "rejected":
            loads_by_batch[batch]["rejected"] += 1

    return {
        "year_filter": year,
        "loads_by_year": loads_by_year,
        "current_year_stats": {
            "total": total_filtered,
            "for_approval": for_approval_filtered,
            "approved": approved_filtered,
            "rejected": rejected_filtered
        },
        "loads_by_batch": loads_by_batch,
        "available_years": sorted(set(key for key in loads_by_year.keys() if key.isdigit()))
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


@router.delete("/accounts/{account_id}")
async def delete_account(account_id: int, current_user: CurrentUser):
    ensure_management_role(current_user)

    try:
        account = select_one(
            "users",
            filters={"id": f"eq.{account_id}"},
            select="id,username,user_type,email",
        )
        if not account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

        if account.get("user_type") not in {"admin", "supervisor"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only admin and supervisor accounts can be deleted here")

        if int(account_id) == int(current_user["id"]):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")

        reassign_management_history(account_id, int(current_user["id"]))
        delete_user_messages(account_id)
        delete_user_auth_artifacts(account.get("email"))
        delete_rows("notifications", filters={"user_id": f"eq.{account_id}"}, returning="minimal")
        delete_rows("users", filters={"id": f"eq.{account_id}"}, returning="minimal")
        cache_manager.clear_pattern("admin_history:*")

        return {"message": "Account deleted successfully"}
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
                "sex": payload.sex,
                "position": payload.position,
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
                "TMC Level I Number": trainer.get("tm_number") or "",
                "TMC Level I Expiration": format_date(trainer.get("tm_expiration")),
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


@router.get("/programs")
async def get_programs(
    page: int = Query(1, ge=1),
    limit: int = Query(15, ge=1, le=100),
    search: str = Query(""),
    current_user: CurrentUser = None
):
    ensure_management_role(current_user)

    try:
        filters = {"is_active": FILTER_TRUE}
        if search:
            # Add search filter for program name or type
            filters["or"] = f"(name.ilike.%{search}%,type.ilike.%{search}%)"
        
        # Calculate pagination
        offset = (page - 1) * limit
        
        # Get paginated results with count header
        programs = select_rows(
            "programs", 
            filters=filters, 
            order=ORDER_DESC,
            limit=limit,
            offset=offset,
            select="id,name,description,type,validity,hours,is_active,created_at"
        )
        
        # For now, estimate total based on whether we got fewer results than requested
        # This avoids the extra count query. A proper solution would parse Content-Range header
        has_more = len(programs) == limit
        
        return {
            "data": programs,
            "currentPage": page,
            "pageSize": limit,
            "hasMore": has_more
        }
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/trainers")
async def get_trainers(
    page: int = Query(1, ge=1),
    limit: int = Query(15, ge=1, le=100),
    search: str = Query(""),
    current_user: CurrentUser = None
):
    ensure_management_role(current_user)

    try:
        filters = {"is_active": FILTER_TRUE}
        if search:
            # Add search filter for trainer name or email
            filters["or"] = f"(trainer_name.ilike.%{search}%,username.ilike.%{search}%)"
        
        # Calculate pagination
        offset = (page - 1) * limit
        
        # Get paginated results
        trainers = select_rows(
            "trainers", 
            filters=filters, 
            order="trainer_name.asc",
            limit=limit,
            offset=offset,
            select="id,user_id,username,trainer_name,first_name,last_name,tm_number,tm_expiration,nttc_number,is_active,created_at"
        )
        
        # Check if there are more results
        has_more = len(trainers) == limit
        
        return {
            "data": trainers,
            "currentPage": page,
            "pageSize": limit,
            "hasMore": has_more
        }
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/teaching-loads/summary")
async def get_teaching_loads_summary(current_user: CurrentUser):
    ensure_management_role(current_user)

    try:
        cache_key = get_teaching_loads_summary_cache_key()
        cached = cache_manager.get(cache_key)
        if cached is not None:
            return cached

        teaching_loads = select_rows(
            "trainer_programs",
            filters={"approval_status": "eq.approved"},
            order="created_at.desc",
            select="id,trainer_id,program_id,hours_per_day,approval_status,approval_notes,assigned_by,approved_by,approved_at,created_at,schedule_date",
        )

        program_ids = {load["program_id"] for load in teaching_loads if load.get("program_id") is not None}
        trainer_ids = {load["trainer_id"] for load in teaching_loads if load.get("trainer_id") is not None}
        user_ids = (
            {load.get("assigned_by") for load in teaching_loads if load.get("assigned_by") is not None}
            | {load.get("approved_by") for load in teaching_loads if load.get("approved_by") is not None}
        )

        programs_map = {}
        trainers_map = {}
        users_map = load_users_map(user_ids)

        if program_ids:
            programs = select_rows(
                "programs",
                filters={"id": f"in.({','.join(map(str, sorted(program_ids)))})"},
                select="id,name,type,hours,schedule,validity,is_active",
            )
            programs_map = {program["id"]: program for program in programs}

        if trainer_ids:
            trainers = select_rows(
                "trainers",
                filters={"id": f"in.({','.join(map(str, sorted(trainer_ids)))})"},
                select="id,trainer_name,username",
            )
            trainers_map = {trainer["id"]: trainer for trainer in trainers}

        enriched_loads = []
        for load in teaching_loads:
            program = programs_map.get(load["program_id"])
            trainer = trainers_map.get(load["trainer_id"])
            if not program or not trainer:
                continue

            assigned_user = users_map.get(load.get("assigned_by"))
            approved_user = users_map.get(load.get("approved_by"))
            schedule_rows = load_schedule_rows(int(load["trainer_id"]), int(load["program_id"]))
            enriched_load = build_assignment_summary(trainer, load, program, schedule_rows, users_map)
            enriched_load.update(
                {
                    "program_name": program.get("name", "Unknown Program"),
                    "program_type": program.get("type", ""),
                    "trainer_name": trainer.get("trainer_name", "Unknown Trainer"),
                    "trainer_username": trainer.get("username", ""),
                    "assigned_by_name": (assigned_user or {}).get("full_name") or (assigned_user or {}).get("username"),
                    "assigned_by_position": (assigned_user or {}).get("position"),
                    "approved_by_name": (approved_user or {}).get("full_name") or (approved_user or {}).get("username"),
                    "approved_by_position": (approved_user or {}).get("position"),
                }
            )
            enriched_loads.append(enriched_load)

        cache_manager.set(cache_key, enriched_loads, 60000)
        return enriched_loads
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/programs/{program_id}/teaching-loads")
async def get_program_teaching_loads(program_id: int, current_user: CurrentUser):
    ensure_management_role(current_user)

    try:
        # Get teaching loads for a specific program
        teaching_loads = select_rows(
            "trainer_programs",
            filters={
                "program_id": f"eq.{program_id}",
                "approval_status": "eq.approved"
            },
            order="created_at.desc",
            select="id,trainer_id,program_id,hours_per_day,approval_status,assigned_by,approved_by,approved_at,created_at"
        )
        
        # Batch fetch programs and trainers instead of N+1 queries
        program_ids = {load['program_id'] for load in teaching_loads}
        trainer_ids = {load['trainer_id'] for load in teaching_loads}
        user_ids = {load.get('assigned_by') for load in teaching_loads if load.get('assigned_by')} | {load.get('approved_by') for load in teaching_loads if load.get('approved_by')}
        
        programs_map = {}
        trainers_map = {}
        users_map = load_users_map(user_ids)
        
        if program_ids:
            programs = select_rows("programs", filters={"id": f"in.({','.join(map(str, program_ids))})"}, select="id,name,type,hours,schedule,validity")
            programs_map = {p['id']: p for p in programs}
        
        if trainer_ids:
            trainers = select_rows("trainers", filters={"id": f"in.({','.join(map(str, trainer_ids))})"}, select="id,trainer_name,username")
            trainers_map = {t['id']: t for t in trainers}
        
        # Enrich with program and trainer details
        enriched_loads = []
        for load in teaching_loads:
            program = programs_map.get(load['program_id'], {})
            trainer = trainers_map.get(load['trainer_id'], {})
            assigned_user = users_map.get(load.get('assigned_by'))
            approved_user = users_map.get(load.get('approved_by'))
            schedule_rows = load_schedule_rows(int(load["trainer_id"]), int(load["program_id"])) if program else []

            enriched_load = build_assignment_summary(trainer, load, program, schedule_rows, users_map)
            enriched_load.update({
                "program_name": program.get("name", "Unknown Program"),
                "program_type": program.get("type", ""),
                "trainer_name": trainer.get("trainer_name", "Unknown Trainer"),
                "trainer_username": trainer.get("username", ""),
                "assigned_by_name": (assigned_user or {}).get("full_name") or (assigned_user or {}).get("username"),
                "assigned_by_position": (assigned_user or {}).get("position"),
                "approved_by_name": (approved_user or {}).get("full_name") or (approved_user or {}).get("username"),
                "approved_by_position": (approved_user or {}).get("position"),
            })
            enriched_loads.append(enriched_load)
        
        return enriched_loads
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/history")
async def get_history(current_user: CurrentUser):
    ensure_management_role(current_user)

    try:
        programs = select_rows(
            "programs",
            select="id,name,type,validity,hours,created_by,created_at",
            order="validity.asc",
        )
        trainers = select_rows(
            "trainers",
            select="id,user_id,username,trainer_name,tm_number,tm_expiration,nttc_number,nttc_expiration,created_at",
            order="trainer_name.asc,username.asc",
        )
        qualifications = select_rows(
            "trainer_qualifications",
            select="id,trainer_id,program_id,nttc_number,nttc_expiration,created_at",
            order="created_at.desc",
        )
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    program_user_map = load_users_map({program.get("created_by") for program in programs if program.get("created_by")})
    trainer_user_map = load_users_map({trainer.get("user_id") for trainer in trainers if trainer.get("user_id")})
    trainer_ids = {qualification.get("trainer_id") for qualification in qualifications if qualification.get("trainer_id")}
    qualification_trainer_map = {trainer["id"]: trainer for trainer in trainers if trainer.get("id") in trainer_ids}
    qualification_program_map = {program["id"]: program for program in programs}

    expired_programs = []
    for program in programs:
        if is_expired_date(program.get("validity")):
            creator = program_user_map.get(program.get("created_by"))
            expired_programs.append(
                {
                    **program,
                    "created_by_name": (creator or {}).get("full_name") or (creator or {}).get("username"),
                    "created_by_position": (creator or {}).get("position"),
                }
            )

    expired_tmc_records = []
    expired_qualification_records = []
    for trainer in trainers:
        user = trainer_user_map.get(trainer.get("user_id"))
        if not user:
            continue
        if is_expired_date(trainer.get("tm_expiration")):
            expired_tmc_records.append(
                {
                    **trainer,
                    "record_type": "TMC",
                    "owner_name": (user or {}).get("full_name") or (user or {}).get("username") or trainer.get("trainer_name") or trainer.get("username"),
                    "owner_position": (user or {}).get("position"),
                }
            )
        if is_expired_date(trainer.get("nttc_expiration")):
            expired_qualification_records.append(
                {
                    **trainer,
                    "record_type": "trainer_nttc",
                    "trainer_display_name": (user or {}).get("full_name") or (user or {}).get("username") or trainer.get("trainer_name") or trainer.get("username"),
                    "trainer_position": (user or {}).get("position"),
                    "program_name": None,
                    "program_type": None,
                    "nttc_number": trainer.get("nttc_number"),
                    "nttc_expiration": trainer.get("nttc_expiration"),
                    "owner_name": (user or {}).get("full_name") or (user or {}).get("username") or trainer.get("trainer_name") or trainer.get("username"),
                    "owner_position": (user or {}).get("position"),
                }
            )

    for qualification in qualifications:
        trainer = qualification_trainer_map.get(qualification.get("trainer_id"))
        program = qualification_program_map.get(qualification.get("program_id"))
        if not trainer or not program:
            continue
        if is_expired_date(qualification.get("nttc_expiration")) or is_expired_date(program.get("validity")):
            trainer_user = trainer_user_map.get(trainer.get("user_id"))
            expired_qualification_records.append(
                {
                    **qualification,
                    "record_type": "qualification",
                    "trainer_name": trainer.get("trainer_name") or trainer.get("username"),
                    "trainer_position": (trainer_user or {}).get("position"),
                    "program_name": program.get("name"),
                    "program_type": program.get("type"),
                    "trainer_display_name": (trainer_user or {}).get("full_name") or (trainer_user or {}).get("username") or trainer.get("trainer_name") or trainer.get("username"),
                }
            )

    return {
        "expired_programs": _build_history_rows(expired_programs, "program"),
        "expired_tmc_records": _build_history_rows(expired_tmc_records, "trainer_tm"),
        "expired_qualifications": _build_history_rows(expired_qualification_records, "qualification"),
        "summary": {
            "expired_programs": len(expired_programs),
            "expired_tmc_records": len(expired_tmc_records),
            "expired_qualifications": len(expired_qualification_records),
        },
    }


# Messaging System Endpoints

@router.get("/messages")
async def get_messages(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: str = Query("all"),
    current_user: CurrentUser = None
):
    # Allow both management roles and trainers to access their messages
    if current_user.get("user_type") not in {"admin", "supervisor", "trainer"}:
        raise HTTPException(status_code=403, detail="Access denied")
    
    try:
        filters = {"is_deleted_by_recipient": "eq.false"}
        if status != "all":
            filters["status"] = f"eq.{status}"
        
        # For trainers, only show messages they sent
        if current_user.get("user_type") == "trainer":
            filters["sender_id"] = f"eq.{current_user['id']}"
        else:
            # For admins/supervisors, show messages they received
            filters["recipient_id"] = f"eq.{current_user['id']}"
        
        # Get total count for pagination
        total_count = count_rows("messages", filters=filters)
        
        # Calculate pagination
        offset = (page - 1) * limit
        total_pages = (total_count + limit - 1) // limit
        
        # Get paginated messages with minimal fields first
        messages = select_rows(
            "messages",
            filters=filters,
            order="created_at.desc",
            limit=limit,
            offset=offset,
            select="id,sender_id,recipient_id,subject,content,status,priority,created_at"
        )
        
        # Batch fetch users for all sender_id and recipient_id
        user_ids = set()
        for message in messages:
            user_ids.add(message['sender_id'])
            user_ids.add(message['recipient_id'])
        
        users_map = {}
        if user_ids:
            users = select_rows("users", filters={"id": f"in.({','.join(map(str, user_ids))})"}, select="id,username,full_name")
            users_map = {u['id']: u for u in users}
        
        # Enrich with sender and recipient information
        enriched_messages = []
        for message in messages:
            sender = users_map.get(message['sender_id'], {})
            recipient = users_map.get(message['recipient_id'], {})
            
            enriched_message = {
                **message,
                "sender_name": sender.get("full_name", sender.get("username", "Unknown")),
                "sender_username": sender.get("username", ""),
                "recipient_name": recipient.get("full_name", recipient.get("username", "Unknown")),
                "recipient_username": recipient.get("username", "")
            }
            enriched_messages.append(enriched_message)
        
        return {
            "data": enriched_messages,
            "totalPages": total_pages,
            "currentPage": page,
            "totalCount": total_count
        }
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/messages/{message_id}")
async def get_message(message_id: int, current_user: CurrentUser):
    ensure_management_role(current_user)
    
    try:
        message = select_one(
            "messages",
            filters={
                "id": f"eq.{message_id}",
                "recipient_id": f"eq.{current_user['id']}",
                "is_deleted_by_recipient": "eq.false"
            }
        )
        
        if not message:
            raise HTTPException(status_code=404, detail="Message not found")
        
        # Get sender info
        sender = select_one("users", filters={"id": f"eq.{message['sender_id']}"})
        
        enriched_message = {
            **message,
            "sender_name": sender.get("full_name", "Unknown") if sender else "Unknown",
            "sender_username": sender.get("username", "") if sender else ""
        }
        
        # Mark as read if unread
        if message["status"] == "unread":
            update_row(
                "messages",
                filters={"id": f"eq.{message_id}"},
                data={"status": "read", "read_at": utc_now_iso()}
            )
        
        return enriched_message
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.post("/messages")
async def send_message(
    message_data: dict,
    current_user: CurrentUser = None
):
    # Allow trainers to send messages to admins
    if current_user.get("user_type") not in {"admin", "supervisor", "trainer"}:
        raise HTTPException(status_code=403, detail="Access denied")
    
    try:
        # Validate required fields
        required_fields = ["recipient_id", "subject", "content"]
        for field in required_fields:
            if field not in message_data or not message_data[field]:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
        
        # Validate recipient exists and is admin/supervisor
        recipient = select_one(
            "users",
            filters={
                "id": f"eq.{message_data['recipient_id']}",
                "user_type": "in.(admin,supervisor)",
                "is_active": "eq.true"
            }
        )
        
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient not found or not accessible")
        
        # Create message
        message = insert_row(
            "messages",
            data={
                "sender_id": current_user["id"],
                "recipient_id": message_data["recipient_id"],
                "subject": message_data["subject"],
                "content": message_data["content"],
                "message_type": message_data.get("message_type", "issue"),
                "priority": message_data.get("priority", "normal")
            }
        )
        
        # Enrich with sender and recipient info for response
        enriched_message = {
            **message,
            "sender_name": current_user.get("full_name", current_user.get("username", "Unknown")),
            "recipient_name": recipient.get("full_name", recipient.get("username", "Unknown"))
        }
        
        return enriched_message
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.put("/messages/{message_id}/reply")
async def reply_to_message(
    message_id: int,
    reply_data: dict,
    current_user: CurrentUser = None
):
    ensure_management_role(current_user)
    
    try:
        # Check if original message exists and user is recipient
        original_message = select_one(
            "messages",
            filters={
                "id": f"eq.{message_id}",
                "recipient_id": f"eq.{current_user['id']}",
                "is_deleted_by_recipient": "eq.false"
            }
        )
        
        if not original_message:
            raise HTTPException(status_code=404, detail="Message not found")
        
        # Create reply message
        reply_message = insert_row(
            "messages",
            data={
                "sender_id": current_user["id"],
                "recipient_id": original_message["sender_id"],
                "subject": f"Re: {original_message['subject']}",
                "content": reply_data["content"],
                "message_type": "other",
                "priority": "normal",
                "reply_to_id": message_id
            }
        )
        
        # Update original message status
        update_row(
            "messages",
            filters={"id": f"eq.{message_id}"},
            data={"status": "replied"}
        )
        
        return reply_message
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.put("/messages/{message_id}/status")
async def update_message_status(
    message_id: int,
    status_data: dict,
    current_user: CurrentUser = None
):
    ensure_management_role(current_user)
    
    try:
        message = select_one(
            "messages",
            filters={
                "id": f"eq.{message_id}",
                "recipient_id": f"eq.{current_user['id']}",
                "is_deleted_by_recipient": "eq.false"
            }
        )
        
        if not message:
            raise HTTPException(status_code=404, detail="Message not found")
        
        update_data = {}
        if "status" in status_data:
            update_data["status"] = status_data["status"]
            if status_data["status"] == "read":
                update_data["read_at"] = utc_now_iso()
        
        updated_message = update_row(
            "messages",
            filters={"id": f"eq.{message_id}"},
            data=update_data
        )
        
        return updated_message
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.delete("/messages/{message_id}")
async def delete_message(message_id: int, current_user: CurrentUser):
    ensure_management_role(current_user)
    
    try:
        message = select_one(
            "messages",
            filters={
                "id": f"eq.{message_id}",
                "recipient_id": f"eq.{current_user['id']}"
            }
        )
        
        if not message:
            raise HTTPException(status_code=404, detail="Message not found")
        
        # Soft delete (mark as deleted by recipient)
        update_row(
            "messages",
            filters={"id": f"eq.{message_id}"},
            data={"is_deleted_by_recipient": True}
        )
        
        return {"message": "Message deleted successfully"}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/messages/unread-count")
async def get_unread_message_count(current_user: CurrentUser):
    # Allow both management roles and trainers to access their unread count
    if current_user.get("user_type") not in {"admin", "supervisor", "trainer"}:
        raise HTTPException(status_code=403, detail="Access denied")
    
    try:
        filters = {
            "status": "eq.unread",
            "is_deleted_by_recipient": "eq.false"
        }
        
        # For trainers, count messages they sent that have been read by admin
        if current_user.get("user_type") == "trainer":
            # Trainers don't have unread messages since they only send
            return {"count": 0}
        else:
            # For admins/supervisors, count messages they received
            filters["recipient_id"] = f"eq.{current_user['id']}"
        
        count = count_rows("messages", filters=filters)
        
        return {"count": count}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/admin-users")
async def get_admin_users(current_user: CurrentUser):
    ensure_management_role(current_user)
    
    try:
        admins = select_rows(
            "users",
            filters={
                "user_type": "in.(admin,supervisor)",
                "is_active": "eq.true"
            },
            order="full_name.asc"
        )
        
        return admins
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
