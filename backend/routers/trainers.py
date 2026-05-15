from datetime import datetime, date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .auth import get_current_user, get_password_hash
from ..cache_manager import cache_manager
from ..schedule_utils import build_assignment_summary, sync_assignment_schedule
from ..schemas import (
    TeachingLoadCreate,
    TeachingLoadResponse,
    TrainerCreate,
    TrainerResponse,
    TrainerSelfUpdate,
    TrainerUpdate,
)
from ..socket_manager import broadcast_schedule_update, broadcast_trainer_update, send_notification_to_user
from ..supabase_rest import SupabaseAPIError, delete_rows, get_public_error_message, insert_row, select_one, select_rows, update_row

router = APIRouter()

ADMIN_ACCESS_DENIED = "Access denied. Admin access required."
TRAINER_NOT_FOUND = "Trainer not found"
TRAINERS_CACHE_PATTERN = "trainers:*"
QUALIFICATIONS_CACHE_PATTERN = "trainer_qualifications:*"
SCHEDULES_CACHE_PATTERN = "schedules:*"
CurrentUser = Annotated[dict, Depends(get_current_user)]


def raise_supabase_http(exc: SupabaseAPIError):
    status_code = exc.status_code if 400 <= exc.status_code < 600 else status.HTTP_500_INTERNAL_SERVER_ERROR
    raise HTTPException(status_code=status_code, detail=get_public_error_message(exc)) from exc


def ensure_admin(current_user: dict):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)


def ensure_management_user(current_user: dict):
    if current_user.get("user_type") not in {"admin", "supervisor"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")


def get_trainer_or_404(trainer_id: int) -> dict:
    trainer = select_one("trainers", filters={"id": f"eq.{trainer_id}"})
    if not trainer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TRAINER_NOT_FOUND)
    return trainer


def get_program_or_404(program_id: int) -> dict:
    program = select_one("programs", filters={"id": f"eq.{program_id}", "is_active": "eq.true"})
    if not program:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Program not found")
    return program


def build_trainer_name(payload: dict[str, Any]) -> str | None:
    trainer_name = payload.get("trainer_name")
    if trainer_name:
        return trainer_name

    parts = [
        payload.get("first_name"),
        payload.get("middle_name"),
        payload.get("last_name"),
    ]
    name = " ".join(part.strip() for part in parts if part and part.strip()).strip()
    if payload.get("extension"):
        name = f"{name} {payload['extension'].strip()}".strip()
    return name or None


def clear_trainer_caches():
    cache_manager.clear_pattern(TRAINERS_CACHE_PATTERN)
    cache_manager.clear_pattern(QUALIFICATIONS_CACHE_PATTERN)
    cache_manager.clear_pattern(SCHEDULES_CACHE_PATTERN)
    cache_manager.clear_pattern("schedules_trainer_programs:*")
    cache_manager.clear_pattern("schedules_schedule:*")
    cache_manager.clear_pattern("trainer_schedule:*")
    cache_manager.clear_pattern("trainer_programs:*")


def get_qualification_cache_key(trainer_id: int) -> str:
    return cache_manager.get_cache_key("trainer_qualifications", trainer_id=trainer_id)


def load_trainer_qualifications(trainer_id: int) -> list[dict]:
    qualification_rows = select_rows(
        "trainer_qualifications",
        filters={"trainer_id": f"eq.{trainer_id}"},
        order="created_at.desc",
        select="id,trainer_id,program_id,nttc_number,created_at,updated_at"
    )
    
    # Batch fetch all programs at once instead of N+1 queries
    program_ids = {q['program_id'] for q in qualification_rows}
    programs_map = {}
    if program_ids:
        programs = select_rows("programs", filters={"id": f"in.({','.join(map(str, program_ids))})"}, select="id,name,type,hours,is_active")
        programs_map = {p['id']: p for p in programs}
    
    result = []
    for qualification in qualification_rows:
        program = programs_map.get(qualification['program_id'])
        result.append({
            **qualification,
            "program": program,
        })
    return result


def create_or_update_qualification(trainer_id: int, program_id: int, nttc_number: str | None):
    existing = select_one(
        "trainer_qualifications",
        filters={
            "trainer_id": f"eq.{trainer_id}",
            "program_id": f"eq.{program_id}",
        },
    )
    payload = {
        "trainer_id": trainer_id,
        "program_id": program_id,
        "nttc_number": nttc_number,
        "updated_at": datetime.now().isoformat(),
    }
    if existing:
        return update_row(
            "trainer_qualifications",
            payload,
            filters={"id": f"eq.{existing['id']}"},
        ) or existing

    payload["created_at"] = datetime.now().isoformat()
    return insert_row("trainer_qualifications", payload)


@router.get("/")
async def get_trainers(
    current_user: CurrentUser,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    page: Annotated[int | None, Query(ge=1)] = None,
    search: Annotated[str | None, Query()] = None,
):
    ensure_management_user(current_user)

    if page is not None:
        skip = (page - 1) * limit

    cache_key = cache_manager.get_cache_key("trainers", skip=skip, limit=limit, search=search)
    cached = cache_manager.get(cache_key)
    if cached:
        return cached

    try:
        filters = {"is_active": "eq.true"}
        # Fetch only needed columns
        all_trainers = select_rows("trainers", filters=filters, order="created_at.desc", select="id,user_id,username,trainer_name,first_name,last_name,tm_number,tm_expiration,nttc_number,nttc_expiration,is_active,created_at")

        if search:
            search_lower = search.lower()
            all_trainers = [
                trainer for trainer in all_trainers
                if search_lower in (trainer.get("trainer_name") or "").lower()
                or search_lower in (trainer.get("username") or "").lower()
                or search_lower in (trainer.get("first_name") or "").lower()
                or search_lower in (trainer.get("last_name") or "").lower()
            ]

        total = len(all_trainers)
        trainers = all_trainers[skip:skip + limit]
        total_pages = max(1, -(-total // limit))
        
        # Fetch user emails/names for this batch in one query instead of N queries
        user_ids = [t['user_id'] for t in trainers]
        users_map = {}
        if user_ids:
            # Use select with filter to get all users at once
            users = select_rows("users", filters={"id": f"in.({','.join(map(str, user_ids))})"}, select="id,email,full_name")
            users_map = {u['id']: u for u in users}
        
        for trainer in trainers:
            user = users_map.get(trainer['user_id'], {})
            trainer["email"] = user.get("email")
            trainer["full_name"] = user.get("full_name")
        
        response = {
            "data": trainers,
            "total": total,
            "skip": skip,
            "limit": limit,
            "currentPage": (skip // limit) + 1,
            "totalPages": total_pages,
            "has_more": (skip + limit) < total,
        }
        cache_manager.set(cache_key, response, 300000)  # 5 min cache
        return response
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.post("/", response_model=TrainerResponse)
async def create_trainer(trainer_data: TrainerCreate, current_user: CurrentUser):
    ensure_admin(current_user)

    trainer_payload = trainer_data.dict()
    trainer_name = build_trainer_name(trainer_payload)

    try:
        existing_user = select_one("users", filters={"username": f"eq.{trainer_data.username}"}, select="id")
        if existing_user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")

        existing_email = select_one("users", filters={"email": f"eq.{trainer_data.email}"}, select="id")
        if existing_email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

        user = insert_row(
            "users",
            {
                "username": trainer_data.username,
                "email": trainer_data.email,
                "full_name": trainer_name,
                "password_hash": get_password_hash(trainer_data.password),
                "user_type": "trainer",
                "is_active": True,
            },
        )

        try:
            trainer = insert_row(
                "trainers",
                {
                    "user_id": user["id"],
                    "username": trainer_data.username,
                    "trainer_name": trainer_name,
                    "first_name": trainer_data.first_name,
                    "middle_name": trainer_data.middle_name,
                    "last_name": trainer_data.last_name,
                    "extension": trainer_data.extension,
                    "trainer_type": trainer_data.trainer_type,
                    "tm_number": trainer_data.tm_number,
                    "tm_expiration": trainer_data.tm_expiration,
                    "nttc_number": trainer_data.nttc_number,
                    "nttc_expiration": trainer_data.nttc_expiration,
                    "ctpr_recognition_number": trainer_data.ctpr_recognition_number,
                    "is_active": True,
                },
            )

            for qualification in trainer_data.qualifications:
                create_or_update_qualification(trainer["id"], qualification.program_id, qualification.nttc_number)

            clear_trainer_caches()
            await broadcast_trainer_update(trainer)
            return trainer
        except SupabaseAPIError:
            try:
                delete_rows("users", filters={"id": f"eq.{user['id']}"}, returning="minimal")
            except SupabaseAPIError:
                pass
            raise
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/{trainer_id}", response_model=TrainerResponse)
async def get_trainer(trainer_id: int, current_user: CurrentUser):
    ensure_management_user(current_user)
    try:
        return get_trainer_or_404(trainer_id)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.put("/{trainer_id}", response_model=TrainerResponse)
async def update_trainer(trainer_id: int, trainer_data: TrainerUpdate, current_user: CurrentUser):
    ensure_admin(current_user)

    try:
        trainer = get_trainer_or_404(trainer_id)
        user = select_one("users", filters={"id": f"eq.{trainer['user_id']}"})
        update_data = trainer_data.dict(exclude_unset=True)

        trainer_updates = {
            key: value
            for key, value in update_data.items()
            if key
            in {
                "trainer_name",
                "first_name",
                "middle_name",
                "last_name",
                "extension",
                "trainer_type",
                "tm_number",
                "tm_expiration",
                "nttc_number",
                "nttc_expiration",
                "ctpr_recognition_number",
            }
        }

        if "email" in update_data and user:
            other_email_user = select_one("users", filters={"email": f"eq.{update_data['email']}"}, select="id")
            if other_email_user and int(other_email_user["id"]) != int(user["id"]):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")
            update_row(
                "users",
                {
                    "email": update_data["email"],
                    "full_name": build_trainer_name({**trainer, **trainer_updates}),
                },
                filters={"id": f"eq.{trainer['user_id']}"},
            )
        elif user:
            update_row(
                "users",
                {
                    "full_name": build_trainer_name({**trainer, **trainer_updates}),
                },
                filters={"id": f"eq.{trainer['user_id']}"},
            )

        updated_trainer = trainer
        if trainer_updates:
            if "trainer_name" not in trainer_updates:
                trainer_updates["trainer_name"] = build_trainer_name({**trainer, **trainer_updates})
            updated_trainer = update_row("trainers", trainer_updates, filters={"id": f"eq.{trainer_id}"}) or trainer

        clear_trainer_caches()
        await broadcast_trainer_update(updated_trainer)
        return updated_trainer
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.put("/me/profile", response_model=TrainerResponse)
async def update_trainer_profile(trainer_data: TrainerSelfUpdate, current_user: CurrentUser):
    if current_user.get("user_type") != "trainer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Trainer access required.")

    try:
        trainer = select_one("trainers", filters={"username": f"eq.{current_user['username']}"})
        if not trainer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trainer profile not found")

        update_data = trainer_data.dict(exclude_unset=True)
        if update_data and "trainer_name" not in update_data:
            update_data["trainer_name"] = build_trainer_name({**trainer, **update_data})

        updated_trainer = update_row("trainers", update_data, filters={"id": f"eq.{trainer['id']}"}) or trainer
        update_row(
            "users",
            {"full_name": build_trainer_name({**trainer, **update_data})},
            filters={"id": f"eq.{trainer['user_id']}"},
        )
        clear_trainer_caches()
        await broadcast_trainer_update(updated_trainer)
        return updated_trainer
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.delete("/{trainer_id}")
async def delete_trainer(trainer_id: int, current_user: CurrentUser):
    ensure_admin(current_user)

    try:
        trainer = get_trainer_or_404(trainer_id)
        trainer_user_id = trainer["user_id"]
        delete_rows("schedules", filters={"trainer_id": f"eq.{trainer_id}"}, returning="minimal")
        delete_rows("trainer_programs", filters={"trainer_id": f"eq.{trainer_id}"}, returning="minimal")
        delete_rows("trainer_qualifications", filters={"trainer_id": f"eq.{trainer_id}"}, returning="minimal")
        delete_rows("notifications", filters={"user_id": f"eq.{trainer_user_id}"}, returning="minimal")
        delete_rows("trainers", filters={"id": f"eq.{trainer_id}"}, returning="minimal")
        delete_rows("users", filters={"id": f"eq.{trainer_user_id}"}, returning="minimal")
        clear_trainer_caches()
        trainer["deleted"] = True
        await broadcast_trainer_update(trainer)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return {"message": "Trainer deleted successfully"}


@router.get("/{trainer_id}/qualifications")
async def get_trainer_qualifications(trainer_id: int, current_user: CurrentUser):
    try:
        trainer = get_trainer_or_404(trainer_id)
        if current_user.get("user_type") not in {"admin", "supervisor"} and trainer.get("username") != current_user.get("username"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

        cache_key = get_qualification_cache_key(trainer_id)
        cached = cache_manager.get(cache_key)
        if cached:
            return {"data": cached}

        qualifications = load_trainer_qualifications(trainer_id)
        cache_manager.set(cache_key, qualifications)
        return {"data": qualifications}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.post("/{trainer_id}/qualifications")
async def add_trainer_qualification(trainer_id: int, payload: dict[str, Any], current_user: CurrentUser):
    ensure_admin(current_user)

    program_id = int(payload.get("program_id"))
    nttc_number = payload.get("nttc_number")

    try:
        get_trainer_or_404(trainer_id)
        get_program_or_404(program_id)
        qualification = create_or_update_qualification(trainer_id, program_id, nttc_number)
        clear_trainer_caches()
        return qualification
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.delete("/{trainer_id}/qualifications/{program_id}")
async def delete_trainer_qualification(trainer_id: int, program_id: int, current_user: CurrentUser):
    ensure_admin(current_user)

    try:
        delete_rows(
            "trainer_qualifications",
            filters={
                "trainer_id": f"eq.{trainer_id}",
                "program_id": f"eq.{program_id}",
            },
            returning="minimal",
        )
        clear_trainer_caches()
        return {"message": "Qualification removed successfully"}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.post("/{trainer_id}/programs", response_model=TeachingLoadResponse)
async def assign_program_to_trainer(
    trainer_id: int,
    assignment: TeachingLoadCreate,
    current_user: CurrentUser,
):
    ensure_admin(current_user)

    if assignment.hours_per_day not in {4, 8}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hours_per_day must be 4 or 8")

    try:
        trainer = get_trainer_or_404(trainer_id)
        program = get_program_or_404(assignment.program_id)
        qualification = select_one(
            "trainer_qualifications",
            filters={
                "trainer_id": f"eq.{trainer_id}",
                "program_id": f"eq.{assignment.program_id}",
            },
        )
        if not qualification:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Trainer is not qualified for the selected program.",
            )

        existing = select_one(
            "trainer_programs",
            filters={
                "trainer_id": f"eq.{trainer_id}",
                "program_id": f"eq.{assignment.program_id}",
            },
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Program already assigned to this trainer",
            )

        schedule_date = assignment.schedule_date.isoformat() if assignment.schedule_date else date.today().isoformat()
        assignment_row = insert_row(
            "trainer_programs",
            {
                "trainer_id": trainer_id,
                "program_id": assignment.program_id,
                "assigned_by": current_user["id"],
                "hours_per_day": assignment.hours_per_day,
                "approval_status": "for approval",
                "nttc_number": assignment.nttc_number or qualification.get("nttc_number"),
                "schedule_date": schedule_date,
            },
        )
        synced_rows = sync_assignment_schedule(assignment_row, program)
        clear_trainer_caches()

        summary = build_assignment_summary(trainer, assignment_row, program, synced_rows)
        await broadcast_schedule_update(
            {
                "event_type": "assignment_created",
                "trainer_id": trainer_id,
                "program_id": assignment.program_id,
                "data": summary,
            }
        )
        await send_notification_to_user(
            trainer["user_id"],
            "Teaching Load Submitted",
            f"{program['name']} has been assigned to you and is waiting for approval.",
        )
        return assignment_row
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/{trainer_id}/programs")
async def get_trainer_programs(trainer_id: int, current_user: CurrentUser):
    try:
        trainer = get_trainer_or_404(trainer_id)
        if current_user.get("user_type") not in {"admin", "supervisor"} and trainer.get("username") != current_user.get("username"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

        assignments = select_rows(
            "trainer_programs",
            filters={"trainer_id": f"eq.{trainer_id}"},
            order="created_at.desc",
            select="id,trainer_id,program_id,hours_per_day,approval_status,approval_notes,approved_by,approved_at,created_at"
        )

        # Batch fetch all programs at once
        program_ids = {a['program_id'] for a in assignments}
        programs_map = {}
        if program_ids:
            programs = select_rows("programs", filters={"id": f"in.({','.join(map(str, program_ids))})"})
            programs_map = {p['id']: p for p in programs}

        result = []
        for assignment in assignments:
            program = programs_map.get(assignment['program_id'])
            if not program:
                continue
            result.append(
                {
                    **build_assignment_summary(trainer, assignment, program),
                    "program": program,
                }
            )

        return {"data": result}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.delete("/{trainer_id}/programs/{program_id}")
async def remove_program_from_trainer(trainer_id: int, program_id: int, current_user: CurrentUser):
    ensure_admin(current_user)

    try:
        get_trainer_or_404(trainer_id)
        delete_rows(
            "schedules",
            filters={
                "trainer_id": f"eq.{trainer_id}",
                "program_id": f"eq.{program_id}",
            },
            returning="minimal",
        )
        delete_rows(
            "trainer_programs",
            filters={
                "trainer_id": f"eq.{trainer_id}",
                "program_id": f"eq.{program_id}",
            },
            returning="minimal",
        )
        clear_trainer_caches()
        await broadcast_schedule_update(
            {
                "event_type": "assignment_deleted",
                "trainer_id": trainer_id,
                "program_id": program_id,
            }
        )
        return {"message": "Program removed from trainer successfully"}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
