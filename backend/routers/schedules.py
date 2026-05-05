from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Annotated
from backend.database import get_db
from backend.supabase_rest import select_rows, insert_row, update_row, delete_rows, select_one
from backend.schemas import TrainerResponse, ProgramResponse, ScheduleUpdate
from backend.socket_manager import broadcast_schedule_update
from datetime import datetime

router = APIRouter()

@router.get("/trainer/{trainer_id}/programs", responses={500: {"description": "Database query failed"}})
async def get_trainer_programs_schedules(trainer_id: int, db: Annotated[Session, Depends(get_db)]) -> list:
    """Get all programs assigned to a trainer with schedule info
    
    Raises:
        HTTPException: status_code=500 if database query fails
    """
    try:
        # Get trainer-program assignments
        filters = {"trainer_id": f"eq.{trainer_id}"}
        assignments = select_rows(
            table="trainer_programs",
            filters=filters,
            select="*,program_id(id,name,type,days,schedule)"
        )
        
        result = []
        for assignment in assignments:
            program = assignment.get("program_id")
            if program:
                # Handle both dict and list responses from Supabase
                if isinstance(program, list):
                    program = program[0] if program else {}
                if isinstance(program, dict):
                    result.append({
                        "id": assignment.get("id"),
                        "trainer_id": trainer_id,
                        "program_id": program.get("id"),
                        "program_name": program.get("name"),
                        "program_type": program.get("type"),
                        "program_days": program.get("days"),
                        "program_schedule": program.get("schedule"),
                    })
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/trainer/{trainer_id}/program/{program_id}/schedule", responses={500: {"description": "Database query failed"}})
async def get_schedule_for_trainer_program(
    trainer_id: int,
    program_id: int,
    db: Annotated[Session, Depends(get_db)]
) -> list:
    """Get all schedule entries for a trainer-program assignment
    
    Raises:
        HTTPException: status_code=500 if database query fails
    """
    try:
        filters = {
            "trainer_id": f"eq.{trainer_id}",
            "program_id": f"eq.{program_id}"
        }
        schedules = select_rows(
            table="schedules",
            filters=filters,
            order="day_number"
        )
        
        return schedules or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/trainer/{trainer_id}/program/{program_id}/day/{day_number}", responses={400: {"description": "Invalid hours_per_day or status value"}, 500: {"description": "Database operation failed"}})
async def create_or_update_schedule_day(
    trainer_id: int,
    program_id: int,
    day_number: int,
    request: ScheduleUpdate,
    db: Annotated[Session, Depends(get_db)]
) -> Dict[str, Any]:
    """Create or update a single day's schedule entry
    
    Raises:
        HTTPException: status_code=400 if hours_per_day is not 4 or 8
        HTTPException: status_code=400 if status value is invalid
        HTTPException: status_code=500 if database operation fails
    """
    try:
        if request.hours_per_day not in [4, 8]:
            raise HTTPException(status_code=400, detail="hours_per_day must be 4 or 8")
        
        if request.status and request.status not in ['complete', 'absent', 'suspended', 'leave']:
            raise HTTPException(status_code=400, detail="Invalid status value")
        
        # Try to find existing entry
        filters = {
            "trainer_id": f"eq.{trainer_id}",
            "program_id": f"eq.{program_id}",
            "day_number": f"eq.{day_number}"
        }
        existing = select_rows(table="schedules", filters=filters)
        
        schedule_data = {
            "trainer_id": trainer_id,
            "program_id": program_id,
            "day_number": day_number,
            "hours_per_day": request.hours_per_day,
            "status": request.status,  # Include status even if None
            "updated_at": datetime.now().isoformat()
        }
        
        if request.schedule_date:
            schedule_data["schedule_date"] = request.schedule_date
        if request.notes:
            schedule_data["notes"] = request.notes
        
        print(f"[DEBUG] Saving schedule for trainer {trainer_id}, program {program_id}, day {day_number}")
        print(f"[DEBUG] Data to save: {schedule_data}")
        print(f"[DEBUG] Existing record: {existing}")
        
        if existing:
            # Update using filters instead of record_id
            print("[DEBUG] Updating existing record...")
            result = update_row(
                table="schedules",
                payload=schedule_data,
                filters=filters
            )
            # notify admins about the schedule change
            try:
                await broadcast_schedule_update({
                    "trainer_id": trainer_id,
                    "program_id": program_id,
                    "day_number": day_number,
                    "data": result,
                })
            except Exception:
                pass
            print(f"[DEBUG] Update result: {result}")
            return {"status": "updated", "data": result}
        else:
            # Create
            schedule_data["created_at"] = datetime.now().isoformat()
            print("[DEBUG] Creating new record...")
            result = insert_row(table="schedules", payload=schedule_data)
            # notify admins about the new schedule entry
            try:
                await broadcast_schedule_update({
                    "trainer_id": trainer_id,
                    "program_id": program_id,
                    "day_number": day_number,
                    "data": result,
                })
            except Exception:
                pass
            print(f"[DEBUG] Insert result: {result}")
            return {"status": "created", "data": result}
    except Exception as e:
        print(f"[ERROR] Exception in create_or_update_schedule_day: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/trainer/{trainer_id}/program/{program_id}/batch", responses={500: {"description": "Database operation failed"}})
async def batch_create_schedules(
    trainer_id: int,
    program_id: int,
    days: List[dict],
    db: Annotated[Session, Depends(get_db)]
) -> Dict[str, Any]:
    """Batch create schedule entries for multiple days
    
    Raises:
        HTTPException: status_code=500 if database operation fails
    """
    try:
        # days should be list of {"day_number": int, "hours_per_day": int, "schedule_date": str}
        created = []
        
        for day in days:
            day_num = day.get("day_number")
            hours = day.get("hours_per_day", 8)
            date_str = day.get("schedule_date")
            
            if hours not in [4, 8]:
                continue
            
            schedule_data = {
                "trainer_id": trainer_id,
                "program_id": program_id,
                "day_number": day_num,
                "hours_per_day": hours,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
            
            if date_str:
                schedule_data["schedule_date"] = date_str
            
            try:
                result = insert_row(table="schedules", payload=schedule_data)
                created.append(result)
            except Exception:
                # Skip if duplicate/conflict
                pass
        
        return {"status": "batch_created", "count": len(created), "data": created}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/schedule/{schedule_id}", responses={500: {"description": "Database operation failed"}})
async def delete_schedule_entry(schedule_id: int, db: Annotated[Session, Depends(get_db)]) -> Dict[str, Any]:
    """Delete a single schedule entry
    
    Raises:
        HTTPException: status_code=500 if database operation fails
    """
    try:
        filters = {"id": f"eq.{schedule_id}"}
        delete_rows(table="schedules", filters=filters)
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/trainer/{trainer_id}/program/{program_id}/assignment", responses={404: {"description": "Assigned schedule not found"}, 500: {"description": "Database operation failed"}})
async def delete_trainer_program_assignment(
    trainer_id: int,
    program_id: int,
    db: Annotated[Session, Depends(get_db)],
):
    """Delete a trainer-program assignment and all related schedule rows."""
    try:
        assignment_filters = {
            "trainer_id": f"eq.{trainer_id}",
            "program_id": f"eq.{program_id}",
        }
        assignment = select_one("trainer_programs", filters=assignment_filters)
        if not assignment:
            raise HTTPException(status_code=404, detail="Assigned schedule not found")

        schedule_filters = {
            "trainer_id": f"eq.{trainer_id}",
            "program_id": f"eq.{program_id}",
        }
        deleted_schedules = delete_rows("schedules", filters=schedule_filters)
        delete_rows("trainer_programs", filters=assignment_filters)

        return {
            "status": "deleted",
            "deleted_schedule_rows": len(deleted_schedules or []),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
