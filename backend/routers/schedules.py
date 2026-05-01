from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db
from backend.supabase_rest import select_rows, insert_row, update_row, delete_rows, select_one
from backend.schemas import TrainerResponse, ProgramResponse
from datetime import datetime

router = APIRouter()

@router.get("/trainer/{trainer_id}/programs")
async def get_trainer_programs_schedules(trainer_id: int, db: Session = Depends(get_db)):
    """Get all programs assigned to a trainer with schedule info"""
    try:
        # Get trainer-program assignments
        filters = {"trainer_id": f"eq.{trainer_id}"}
        assignments = select_rows(
            table="trainer_programs",
            filters=filters,
            select="*,program_id(id,name,days,schedule)"
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
                        "program_days": program.get("days"),
                        "program_schedule": program.get("schedule"),
                    })
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/trainer/{trainer_id}/program/{program_id}/schedule")
async def get_schedule_for_trainer_program(
    trainer_id: int,
    program_id: int,
    db: Session = Depends(get_db)
):
    """Get all schedule entries for a trainer-program assignment"""
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

@router.post("/trainer/{trainer_id}/program/{program_id}/day/{day_number}")
async def create_or_update_schedule_day(
    trainer_id: int,
    program_id: int,
    day_number: int,
    hours_per_day: int,
    status: str = None,
    schedule_date: str = None,
    notes: str = None,
    db: Session = Depends(get_db)
):
    """Create or update a single day's schedule entry"""
    try:
        if hours_per_day not in [4, 8]:
            raise HTTPException(status_code=400, detail="hours_per_day must be 4 or 8")
        
        if status and status not in ['complete', 'absent', 'suspended', 'leave']:
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
            "hours_per_day": hours_per_day,
            "updated_at": datetime.now().isoformat()
        }
        
        if status:
            schedule_data["status"] = status
        if schedule_date:
            schedule_data["schedule_date"] = schedule_date
        if notes:
            schedule_data["notes"] = notes
        
        if existing:
            # Update using filters instead of record_id
            update_row(
                table="schedules",
                payload=schedule_data,
                filters=filters
            )
            return {"status": "updated", "data": schedule_data}
        else:
            # Create
            schedule_data["created_at"] = datetime.now().isoformat()
            result = insert_row(table="schedules", payload=schedule_data)
            return {"status": "created", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/trainer/{trainer_id}/program/{program_id}/batch")
async def batch_create_schedules(
    trainer_id: int,
    program_id: int,
    days: List[dict],
    db: Session = Depends(get_db)
):
    """Batch create schedule entries for multiple days"""
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

@router.delete("/schedule/{schedule_id}")
async def delete_schedule_entry(schedule_id: int, db: Session = Depends(get_db)):
    """Delete a single schedule entry"""
    try:
        filters = {"id": f"eq.{schedule_id}"}
        delete_rows(table="schedules", filters=filters)
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
