const baseUrl = 'http://localhost:5000/api';

async function test() {
  try {
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'admin@rtc.com', password: 'password' })
    });
    
    if (!loginRes.ok) {
      console.log('Login failed:', await loginRes.text());
      return;
    }
    const token = (await loginRes.json()).access_token;
    
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    
    const trRes = await fetch(`${baseUrl}/trainers`, { headers });
    const trainers = (await trRes.json()).data;
    const trainerId = trainers?.[0]?.id || 1;
    
    const prRes = await fetch(`${baseUrl}/programs`, { headers });
    const programs = (await prRes.json()).data;
    const programId = programs?.[0]?.id || 1;
    
    console.log(`Assigning program ${programId} to trainer ${trainerId}`);
    
    const payload = { trainer_id: trainerId, program_id: programId, assigned_by: 1 };
    const assignRes = await fetch(`${baseUrl}/trainers/${trainerId}/programs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    console.log('Assign response:', assignRes.status, await assignRes.text());
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

test();
