from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status

from routers.auth import get_current_user, get_password_hash
from schemas import TrainerCreate, TrainerResponse, TrainerUpdate
from supabase_rest import SupabaseAPIError, delete_rows, insert_row, select_one, select_rows, update_row

router = APIRouter()

ADMIN_ACCESS_DENIED = "Access denied. Admin access required."
TRAINER_NOT_FOUND = "Trainer not found"
CurrentUser = Annotated[dict, Depends(get_current_user)]


def raise_supabase_http(exc: SupabaseAPIError):
    status_code = exc.status_code if 400 <= exc.status_code < 600 else status.HTTP_500_INTERNAL_SERVER_ERROR
    raise HTTPException(status_code=status_code, detail=exc.message) from exc


@router.get("/", response_model=List[TrainerResponse])
async def get_trainers(current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    try:
        return select_rows("trainers", filters={"is_active": "eq.true"}, order="created_at.desc")
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.post("/", response_model=TrainerResponse)
async def create_trainer(trainer_data: TrainerCreate, current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    try:
        existing_user = select_one("users", filters={"username": f"eq.{trainer_data.username}"}, select="id")
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already exists",
            )

        existing_trainer = select_one("trainers", filters={"username": f"eq.{trainer_data.username}"}, select="id")
        if existing_trainer:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Trainer username already exists",
            )

        user = insert_row(
            "users",
            {
                "username": trainer_data.username,
                "email": f"{trainer_data.username}@trainer.com",
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
                    "trainer_name": trainer_data.trainer_name,
                    "qualifications": trainer_data.qualifications,
                    "tm_number": trainer_data.tm_number,
                    "tm_expiration": trainer_data.tm_expiration,
                    "nttc_number": trainer_data.nttc_number,
                    "nttc_expiration": trainer_data.nttc_expiration,
                    "is_active": True,
                },
            )
        except SupabaseAPIError:
            try:
                delete_rows("users", filters={"id": f"eq.{user['id']}"}, returning="minimal")
            except SupabaseAPIError:
                pass
            raise

        return trainer
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/{trainer_id}", response_model=TrainerResponse)
async def get_trainer(trainer_id: int, current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    try:
        trainer = select_one("trainers", filters={"id": f"eq.{trainer_id}"})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not trainer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TRAINER_NOT_FOUND)
    return trainer


@router.put("/{trainer_id}", response_model=TrainerResponse)
async def update_trainer(trainer_id: int, trainer_data: TrainerUpdate, current_user: CurrentUser):
    try:
        trainer = select_one("trainers", filters={"id": f"eq.{trainer_id}"})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not trainer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TRAINER_NOT_FOUND)

    if current_user.get("user_type") != "admin" and trainer.get("username") != current_user.get("username"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only update your own profile.",
        )

    update_data = trainer_data.dict(exclude_unset=True)
    try:
        updated_trainer = update_row("trainers", update_data, filters={"id": f"eq.{trainer_id}"})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return updated_trainer or trainer


@router.put("/profile", response_model=TrainerResponse)
async def update_trainer_profile(trainer_data: TrainerUpdate, current_user: CurrentUser):
    if current_user.get("user_type") != "trainer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Trainer access required.",
        )

    try:
        trainer = select_one("trainers", filters={"username": f"eq.{current_user['username']}"})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not trainer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trainer profile not found",
        )

    update_data = trainer_data.dict(exclude_unset=True)
    try:
        updated_trainer = update_row("trainers", update_data, filters={"id": f"eq.{trainer['id']}"})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return updated_trainer or trainer


@router.delete("/{trainer_id}")
async def delete_trainer(trainer_id: int, current_user: CurrentUser):
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    try:
        trainer = select_one("trainers", filters={"id": f"eq.{trainer_id}"})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not trainer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TRAINER_NOT_FOUND)

    try:
        update_row("trainers", {"is_active": False}, filters={"id": f"eq.{trainer_id}"})
        update_row("users", {"is_active": False}, filters={"id": f"eq.{trainer['user_id']}"})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return {"message": "Trainer deactivated successfully"}
