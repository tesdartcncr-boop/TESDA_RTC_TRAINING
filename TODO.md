# RTC Human Resource - Fixes Tracker

## 1) Repo understanding
- [x] Read backend schedules router (backend/routers/schedules.py)
- [x] Read backend trainer assignment endpoints (backend/routers/trainers.py)
- [x] Read backend schedule generation utilities (backend/schedule_utils.py)
- [x] Read frontend admin/supervisor teaching loads pages (frontend_admin/src/pages/Schedules.jsx, frontend_supervisor/src/pages/Schedules.jsx)
- [x] Read frontend trainer portal calendar component (frontend_user/src/components/TrainerScheduleView.jsx)
- [x] Read frontend trainer portal loads list (frontend_user/src/pages/Dashboard.jsx)
- [x] Read frontend auth contexts for remember-me behavior:
  - [x] frontend_admin/src/contexts/AuthContext.jsx
  - [x] frontend_supervisor/src/contexts/AuthContext.jsx
  - [x] frontend_user/src/contexts/AuthContext.jsx
- [x] Read frontend trainer login page (frontend_user/src/pages/Login.jsx)

## 2) Logging + performance diagnosis
- [ ] Add request/data fetch timing + correlation-id logging around:
  - [ ] /api/schedules/trainer/{trainer_id}/programs
  - [ ] /api/schedules/trainer/{trainer_id}/program/{program_id}/schedule
  - [ ] schedule sync operations (sync_assignment_schedule / load_schedule_rows)
- [ ] Identify slow DB queries or N+1 patterns and reduce them (batching / caching improvements)

## 3) Teaching load visibility fix (supervisor + trainer)
- [ ] Fix stale caches so newly created teaching loads appear for:
  - [ ] Supervisor teaching loads list
  - [ ] Trainer portal approved loads list
- [ ] Ensure backend cache keys are invalidated on assignment creation/approval/update
  - [ ] After assign_program_to_trainer (backend/routers/trainers.py)
  - [ ] After approval changes (backend/routers/schedules.py update_assignment_approval)
  - [ ] After schedule day updates (backend/routers/schedules.py create_or_update_schedule_day)

## 4) “Remember me” fix
- [ ] Verify rememberMe wiring on all login UIs (management, supervisor, trainer)
- [ ] Confirm correct token key usage:
  - [ ] management_token vs management_session_token
  - [ ] supervisor_token vs supervisor_session_token
  - [ ] trainer_token vs trainer_session_token
- [ ] Add logging to /api/auth/login to confirm rememberMe and token persistence behavior

## 5) Teaching load -> auto generated calendar
- [x] Trainer portal calendar rendering exists (TrainerScheduleView + Dashboard)
- [ ] Ensure supervisor/admin “click teaching load” always triggers a fresh calendar load when:
  - [ ] schedule cache missing
  - [ ] schedule changed due to approval/day updates

## 6) Verification / Testing
- [ ] Run frontend flows:
  - [ ] Admin creates teaching load -> Supervisor sees it immediately
  - [ ] Admin approves teaching load -> Trainer sees it and clicks -> calendar auto displays
  - [ ] Toggle remember-me -> reload browser -> stays logged in until token expiry
- [ ] Check backend logs for slow fetches and confirm reduced latency
