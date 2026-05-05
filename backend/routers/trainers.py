from typing import Annotated, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status, Query

from .auth import get_current_user, get_password_hash
from ..schemas import TrainerCreate, TrainerResponse, TrainerUpdate, TrainerProgramCreate, TrainerProgramResponse
from ..supabase_rest import SupabaseAPIError, delete_rows, insert_row, select_one, select_rows, update_row
from ..cache_manager import cache_manager
from ..socket_manager import broadcast_trainer_update

router = APIRouter()

ADMIN_ACCESS_DENIED = "Access denied. Admin access required."
TRAINER_NOT_FOUND = "Trainer not found"
TRAINERS_CACHE_PATTERN = "trainers:*"
CurrentUser = Annotated[dict, Depends(get_current_user)]


def raise_supabase_http(exc: SupabaseAPIError):
    status_code = exc.status_code if 400 <= exc.status_code < 600 else status.HTTP_500_INTERNAL_SERVER_ERROR
    raise HTTPException(status_code=status_code, detail=exc.message) from exc


@router.get("/")
async def get_trainers(
    current_user: CurrentUser,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    search: Annotated[str, Query()] = None
) -> Dict[str, Any]:
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


@router.post("/")
async def create_trainer(trainer_data: TrainerCreate, current_user: CurrentUser) -> TrainerResponse:
    """Create a new trainer account
    
    Raises:
        HTTPException: status_code=403 if user is not admin
        HTTPException: status_code=400 if username already exists
        HTTPException: status_code=500 if database operation fails
    """
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
                    "tm_number": trainer_data.tm_number,
                    "tm_expiration": trainer_data.tm_expiration,
                    "nttc_number": trainer_data.nttc_number,
                    "nttc_expiration": trainer_data.nttc_expiration,
                    "is_active": True,
                },
            )
            # Invalidate cache
            cache_manager.clear_pattern(TRAINERS_CACHE_PATTERN)
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


@router.get("/{trainer_id}")
async def get_trainer(trainer_id: int, current_user: CurrentUser) -> TrainerResponse:
    """Get a specific trainer by ID
    
    Raises:
        HTTPException: status_code=403 if user is not admin
        HTTPException: status_code=404 if trainer not found
        HTTPException: status_code=500 if database operation fails
    """
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    try:
        trainer = select_one("trainers", filters={"id": f"eq.{trainer_id}"})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not trainer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TRAINER_NOT_FOUND)
    return trainer


@router.put("/{trainer_id}")
async def update_trainer(trainer_id: int, trainer_data: TrainerUpdate, current_user: CurrentUser) -> TrainerResponse:
    """Update a specific trainer's information
    
    Raises:
        HTTPException: status_code=403 if user is not admin or not the trainer being updated
        HTTPException: status_code=404 if trainer not found
        HTTPException: status_code=500 if database operation fails
    """
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
        cache_manager.clear_pattern(TRAINERS_CACHE_PATTERN)
        await broadcast_trainer_update(updated_trainer or trainer)
        return updated_trainer or trainer
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


def _prepare_user_updates(update_data: Dict[str, Any], trainer: Dict[str, Any]) -> Dict[str, Any]:
    """Extract and prepare user_updates from trainer_data"""
    user_updates = {}
    
    if 'username' in update_data and update_data['username']:
        new_username = update_data.pop('username')
        existing_user = select_one('users', filters={"username": f"eq.{new_username}"}, select='id')
        if existing_user and int(existing_user.get('id')) != int(trainer.get('user_id')):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Username already exists')
        user_updates['username'] = new_username
    
    if 'password' in update_data and update_data['password']:
        new_password = update_data.pop('password')
        user_updates['password_hash'] = get_password_hash(new_password)
    
    return user_updates


@router.put("/me/profile")
async def update_trainer_profile(trainer_data: TrainerUpdate, current_user: CurrentUser) -> TrainerResponse:
    """Update the current trainer's profile
    
    Raises:
        HTTPException: status_code=403 if user is not a trainer
        HTTPException: status_code=404 if trainer profile not found
        HTTPException: status_code=400 if username already exists
        HTTPException: status_code=500 if database operation fails
    """
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
        # Handle username/password updates in users table if provided
        user_updates = _prepare_user_updates(update_data, trainer)
        
        if user_updates:
            update_row('users', user_updates, filters={"id": f"eq.{trainer['user_id']}"})

        # Update trainers table with remaining fields (trainer_name, qualifications, tm_*, nttc_*)
        if update_data:
            updated_trainer = update_row("trainers", update_data, filters={"id": f"eq.{trainer['id']}"})
        else:
            updated_trainer = select_one('trainers', filters={"id": f"eq.{trainer['id']}"})
        
        # Invalidate cache and broadcast
        cache_manager.clear_pattern(TRAINERS_CACHE_PATTERN)
        await broadcast_trainer_update(updated_trainer or trainer)
        return updated_trainer or trainer
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


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
        trainer_user_id = trainer['user_id']
        update_row("trainers", {"is_active": False}, filters={"id": f"eq.{trainer_id}"})
        update_row("users", {"is_active": False}, filters={"id": f"eq.{trainer_user_id}"})
        # Invalidate cache
        cache_manager.clear_pattern("trainers:*")
        trainer["is_active"] = False
        await broadcast_trainer_update(trainer)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return {"message": "Trainer deactivated successfully"}


# Trainer Program Assignment endpoints
@router.post("/{trainer_id}/programs", response_model=TrainerProgramResponse)
async def assign_program_to_trainer(
    trainer_id: int,
    assignment: TrainerProgramCreate,
    current_user: CurrentUser
):
    """Assign a program to a trainer"""
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    try:
        trainer = select_one("trainers", filters={"id": f"eq.{trainer_id}"})
        if not trainer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TRAINER_NOT_FOUND)

        program = select_one("programs", filters={"id": f"eq.{assignment.program_id}"})
        if not program:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Program not found")

        # Check if assignment already exists
        existing = select_one(
            "trainer_programs",
            filters={
                "trainer_id": f"eq.{trainer_id}",
                "program_id": f"eq.{assignment.program_id}"
            }
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Program already assigned to this trainer"
            )

        assignment_data = {
            "trainer_id": trainer_id,
            "program_id": assignment.program_id,
            "assigned_by": current_user["id"],
            "schedule_date": assignment.schedule_date.isoformat() if assignment.schedule_date else None
        }

        result = insert_row("trainer_programs", assignment_data)
        
        # Also send notification to trainer
        try:
            insert_row(
                "notifications",
                {
                    "user_id": trainer["user_id"],
                    "title": "New Program Assignment",
                    "message": f"{program['name']} has been assigned to you.",
                    "is_read": False
                }
            )
        except SupabaseAPIError:
            pass  # Don't fail if notification fails
        
        return result

    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/{trainer_id}/programs")
async def get_trainer_programs(trainer_id: int, current_user: CurrentUser):
    """Get all programs assigned to a trainer"""
    try:
        trainer = select_one("trainers", filters={"id": f"eq.{trainer_id}"})
        if not trainer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TRAINER_NOT_FOUND)

        # Admin can see any trainer's programs, trainers can only see their own
        if current_user.get("user_type") != "admin" and trainer.get("username") != current_user.get("username"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied."
            )

        assignments = select_rows(
            "trainer_programs",
            filters={"trainer_id": f"eq.{trainer_id}"},
            order="created_at.desc"
        )

        # Enrich with program details
        result = []
        for assignment in assignments:
            program = select_one("programs", filters={"id": f"eq.{assignment['program_id']}"})
            if program:
                result.append({
                    "id": assignment["id"],
                    "program": program,
                    "schedule_date": assignment.get("schedule_date"),
                    "created_at": assignment["created_at"]
                })

        return {"data": result}

    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.delete("/{trainer_id}/programs/{program_id}")
async def remove_program_from_trainer(
    trainer_id: int,
    program_id: int,
    current_user: CurrentUser
):
    """Remove a program assignment from a trainer"""
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMIN_ACCESS_DENIED)

    try:
        trainer = select_one("trainers", filters={"id": f"eq.{trainer_id}"})
        if not trainer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TRAINER_NOT_FOUND)

        delete_rows(
            "trainer_programs",
            filters={
                "trainer_id": f"eq.{trainer_id}",
                "program_id": f"eq.{program_id}"
            },
            returning="minimal"
        )

        return {"message": "Program removed from trainer successfully"}

    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
