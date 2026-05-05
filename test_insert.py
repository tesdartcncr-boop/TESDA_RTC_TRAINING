import sys
from pathlib import Path
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))
from backend.supabase_rest import insert_row, select_rows, select_one

# Let's see what programs and trainers exist
trainers = select_rows("trainers", limit=1)
programs = select_rows("programs", limit=1)

if not trainers or not programs:
    print("No trainers or programs found")
    sys.exit(1)

trainer_id = trainers[0]["id"]
program_id = programs[0]["id"]

# Check if already assigned
existing = select_one("trainer_programs", filters={"trainer_id": f"eq.{trainer_id}", "program_id": f"eq.{program_id}"})
if existing:
    print(f"Already assigned: {existing}")
    sys.exit(0)

assignment_data = {
    "trainer_id": trainer_id,
    "program_id": program_id,
    "assigned_by": 1,
    "schedule_date": None
}

try:
    result = insert_row("trainer_programs", assignment_data)
    print("Insert Result:", result)
except Exception as e:
    print("Error:", str(e))

