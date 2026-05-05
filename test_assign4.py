import urllib.request
import json
import sys

token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJqb3J2aW5jZXNvcmlhbm8zIiwiZXhwIjoxNzc3OTYzNzUwfQ.rgug08fQjwGi3xCgJXUTCfxO6YyZ5yPhyNgF1_RaLA8"
url = "http://localhost:5000/api/trainers/2/programs"
payload = json.dumps({"trainer_id": 2, "program_id": 1, "assigned_by": 1}).encode('utf-8')
req = urllib.request.Request(url, data=payload, method="POST", headers={
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
})

try:
    with urllib.request.urlopen(req) as res:
        print("Success:", res.status, res.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code, e.read().decode('utf-8'))
except Exception as e:
    print("Error:", str(e))
