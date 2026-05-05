import requests
import json

res = requests.post('http://localhost:5000/api/auth/login', json={"email": "admin@rtc.com", "password": "password"})
if res.status_code != 200:
    print("Login failed:", res.text)
else:
    token = res.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # Let's get trainers and programs to pick valid IDs
    tr_res = requests.get('http://localhost:5000/api/trainers', headers=headers)
    pr_res = requests.get('http://localhost:5000/api/programs', headers=headers)
    
    trainer_id = tr_res.json()["data"][0]["id"] if tr_res.json().get("data") else 1
    program_id = pr_res.json()["data"][0]["id"] if pr_res.json().get("data") else 1

    print(f"Assigning program {program_id} to trainer {trainer_id}")
    
    payload = {"trainer_id": trainer_id, "program_id": program_id, "assigned_by": 1}
    res = requests.post(f'http://localhost:5000/api/trainers/{trainer_id}/programs', headers=headers, json=payload)
    print("Assign response:", res.status_code, res.text)
