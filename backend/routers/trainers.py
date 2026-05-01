from typing import Annotated, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status, Query

from .auth import get_current_user, get_password_hash
from ..schemas import TrainerCreate, TrainerResponse, TrainerUpdate
from ..supabase_rest import SupabaseAPIError, delete_rows, insert_row, select_one, select_rows, update_row
from ..cache_manager import cache_manager

router = APIRouter()

ADMIN_ACCESS_DENIED = "Access denied. Admin access required."
TRAINER_NOT_FOUND = "Trainer not found"
CurrentUser = Annotated[dict, Depends(get_current_user)]


def raise_supabase_http(exc: SupabaseAPIError):
    status_code = exc.status_code if 400 <= exc.status_code < 600 else status.HTTP_500_INTERNAL_SERVER_ERROR
    raise HTTPException(status_code=status_code, detail=exc.message) from exc


@router.get("/", response_model=Dict[str, Any])
async def get_trainers(
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    search: str = Query(None)
):
    """Get paginated trainers with optional search and caching"""
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    cache_key = cache_manager.get_cache_key("trainers", skip=skip, limit=limit, search=search)
    
    # Try to get from cache
    cached = cache_manager.get(cache_key)
    if cached:
        return cached
    
    try:
        filters = {"is_active": "eq.true"}
        all_trainers = select_rows("trainers", filters=filters, order="created_at.desc")
        
        # Apply search filter if provided
        if search:
            all_trainers = [
                t for t in all_trainers
                if search.lower() in t.get("trainer_name", "").lower()
                or search.lower() in t.get("username", "").lower()
                or search.lower() in t.get("qualifications", "").lower()
            ]
        
        total = len(all_trainers)
        trainers = all_trainers[skip:skip + limit]
        
        response = {
            "data": trainers,
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
            # Invalidate cache
            cache_manager.clear_pattern("trainers:*")
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
        # Invalidate cache
        cache_manager.clear_pattern("trainers:*")
        return updated_trainer or trainer
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


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
        # Invalidate cache
        cache_manager.clear_pattern("trainers:*")
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return {"message": "Trainer deactivated successfully"}
