import sys
from pathlib import Path
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))
from backend.supabase_rest import select_rows

users = select_rows("users")
print("Users:", users)
