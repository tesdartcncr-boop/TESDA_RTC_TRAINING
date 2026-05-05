import sys
from pathlib import Path
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))

from backend.routers.auth import create_access_token
from backend.supabase_rest import select_rows

admin = select_rows("users", filters={"username": "eq.jorvincesoriano3"})[0]
token = create_access_token(data={"sub": admin["username"]})
print("TOKEN:", token)
