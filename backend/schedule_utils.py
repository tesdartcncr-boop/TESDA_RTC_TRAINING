import math
from datetime import date, datetime, timedelta
from typing import Any

from .supabase_rest import SupabaseAPIError, delete_rows, insert_row, select_rows, update_row

DEFAULT_HOURS_PER_DAY = 8
VALID_HOURS_PER_DAY = set(range(1, 25))
VALID_STATUSES = {"complete", "absent", "nat", "leave", "suspended", "incomplete"}
NON_COMPLETE_STATUSES = {"absent", "nat", "leave", "suspended", "incomplete"}
IN_PROGRESS_STATUS = "in progress"


def parse_date(value: Any) -> date | None:
    if not value:
        return None

    if isinstance(value, date) and not isinstance(value, datetime):
        return value

    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        try:
            if "T" in normalized:
                return datetime.fromisoformat(normalized).date()
            return date.fromisoformat(normalized)
        except ValueError:
            return None

    return None


def format_date(value: Any) -> str | None:
    parsed = parse_date(value)
    return parsed.isoformat() if parsed else None


def is_expired_date(value: Any, *, reference_date: date | None = None) -> bool:
    parsed = parse_date(value)
    if not parsed:
        return False

    today = reference_date or date.today()
    return parsed < today


def hours_to_label(hours_per_day: int) -> str:
    return f"{hours_per_day} Hours/Day"


def get_program_total_hours(program: dict[str, Any]) -> int:
    hours = program.get("hours")
    if hours not in (None, ""):
        try:
            return int(hours)
        except (TypeError, ValueError):
            return 0

    days = program.get("days") or 0
    try:
        return int(days) * get_default_hours_per_day(program)
    except (TypeError, ValueError):
        return 0


def get_default_hours_per_day(program: dict[str, Any]) -> int:
    schedule = (program.get("schedule") or "").strip().lower()
    return 4 if schedule.startswith("4") else DEFAULT_HOURS_PER_DAY


def get_assignment_hours_per_day(assignment: dict[str, Any], program: dict[str, Any]) -> int:
    hours_per_day = assignment.get("hours_per_day")
    try:
        normalized = int(hours_per_day)
    except (TypeError, ValueError):
        normalized = get_default_hours_per_day(program)

    return normalized if normalized in VALID_HOURS_PER_DAY else get_default_hours_per_day(program)


def calculate_base_days(program: dict[str, Any], hours_per_day: int) -> int:
    total_hours = get_program_total_hours(program)
    if total_hours > 0 and hours_per_day > 0:
        return math.ceil(total_hours / hours_per_day)

    try:
        return int(program.get("days") or 0)
    except (TypeError, ValueError):
        return 0


def build_working_dates(
    start_date: date, 
    total_days: int, 
    allowed_days: list[int] = None,
    custom_dates: list[str] = None
) -> list[date]:
    if not allowed_days:
        allowed_days = [0, 1, 2, 3, 4]
    
    if custom_dates is None:
        custom_dates = []

    # Parse custom_dates to date objects
    custom_dates_parsed = set()
    for d_str in custom_dates:
        d_parsed = parse_date(d_str)
        if d_parsed:
            custom_dates_parsed.add(d_parsed)

    dates: list[date] = []
    current = start_date

    # Safety check to prevent infinite loop
    valid_allowed_days = [d for d in allowed_days if 0 <= d <= 6]
    if not valid_allowed_days:
        valid_allowed_days = [0, 1, 2, 3, 4]

    while len(dates) < total_days:
        if current in custom_dates_parsed or current.weekday() in valid_allowed_days:
            dates.append(current)
        current += timedelta(days=1)

    return dates


def get_non_complete_day_count(schedule_rows: list[dict[str, Any]]) -> int:
    return sum(1 for row in schedule_rows if row.get("status") in NON_COMPLETE_STATUSES)


def get_schedule_progress_status(schedule_rows: list[dict[str, Any]]) -> str:
    if not schedule_rows:
        return IN_PROGRESS_STATUS

    marked_days = sum(1 for row in schedule_rows if row.get("status"))
    return "completed" if marked_days == len(schedule_rows) else IN_PROGRESS_STATUS


def get_schedule_progress_counts(schedule_rows: list[dict[str, Any]]) -> tuple[int, int]:
    total_days = len(schedule_rows)
    marked_days = sum(1 for row in schedule_rows if row.get("status"))
    return marked_days, total_days


def get_last_used_day(schedule_rows: list[dict[str, Any]]) -> int:
    used_days = [
        int(row.get("day_number") or 0)
        for row in schedule_rows
        if row.get("status") or row.get("notes")
    ]
    return max(used_days, default=0)


def load_schedule_rows(trainer_id: int, program_id: int) -> list[dict[str, Any]]:
    return select_rows(
        "schedules",
        filters={
            "trainer_id": f"eq.{trainer_id}",
            "program_id": f"eq.{program_id}",
            "day_number": "gt.0",
        },
        order="day_number",
    )


def load_schedule_rows_map(assignments: list[dict[str, Any]]) -> dict[tuple[int, int], list[dict[str, Any]]]:
    pairs = {
        (int(assignment["trainer_id"]), int(assignment["program_id"]))
        for assignment in assignments
        if assignment.get("trainer_id") is not None and assignment.get("program_id") is not None
    }
    if not pairs:
        return {}

    trainer_ids = sorted({trainer_id for trainer_id, _program_id in pairs})
    program_ids = sorted({program_id for _trainer_id, program_id in pairs})
    rows = select_rows(
        "schedules",
        filters={
            "trainer_id": f"in.({','.join(map(str, trainer_ids))})",
            "program_id": f"in.({','.join(map(str, program_ids))})",
            "day_number": "gt.0",
        },
        order="trainer_id.asc,program_id.asc,day_number.asc",
    )

    grouped: dict[tuple[int, int], list[dict[str, Any]]] = {pair: [] for pair in pairs}
    for row in rows:
        key = (int(row["trainer_id"]), int(row["program_id"]))
        if key in grouped:
            grouped[key].append(row)

    return grouped


def mark_overdue_schedule_rows_nat(assignment: dict[str, Any] | None, schedule_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not assignment or assignment.get("approval_status") != "approved" or not schedule_rows:
        return schedule_rows

    today = date.today()
    updated_at = datetime.now().isoformat()
    normalized_rows: list[dict[str, Any]] = []

    for row in schedule_rows:
        schedule_date = parse_date(row.get("schedule_date"))
        if row.get("status") or not schedule_date or schedule_date >= today:
            normalized_rows.append(row)
            continue

        try:
            updated_row = update_row(
                "schedules",
                {
                    "status": "nat",
                    "updated_at": updated_at,
                },
                filters={"id": f"eq.{row['id']}"},
            ) or {**row, "status": "nat", "updated_at": updated_at}
        except SupabaseAPIError:
            updated_row = row

        normalized_rows.append(updated_row)

    return normalized_rows


def load_users_map(user_ids: list[int] | set[int] | tuple[int, ...]) -> dict[int, dict[str, Any]]:
    normalized_ids = sorted({int(user_id) for user_id in user_ids if user_id is not None})
    if not normalized_ids:
        return {}

    users = select_rows(
        "users",
        filters={"id": f"in.({','.join(map(str, normalized_ids))})"},
        select="id,username,full_name,position",
    )
    return {int(user["id"]): user for user in users if user.get("id") is not None}


def sync_assignment_schedule(assignment: dict[str, Any], program: dict[str, Any]) -> list[dict[str, Any]]:
    trainer_id = int(assignment["trainer_id"])
    program_id = int(assignment["program_id"])
    hours_per_day = get_assignment_hours_per_day(assignment, program)
    start_date = parse_date(assignment.get("schedule_date")) or date.today()
    existing_rows = load_schedule_rows(trainer_id, program_id)
    existing_rows = mark_overdue_schedule_rows_nat(assignment, existing_rows)

    base_days = calculate_base_days(program, hours_per_day)
    non_complete_days = get_non_complete_day_count(existing_rows)
    required_days = base_days + non_complete_days
    total_days = max(required_days, get_last_used_day(existing_rows))

    allowed_days = assignment.get("allowed_days")
    if allowed_days is None:
        allowed_days = [0, 1, 2, 3, 4]

    custom_dates = assignment.get("custom_dates")
    working_dates = build_working_dates(start_date, total_days, allowed_days, custom_dates) if total_days > 0 else []
    existing_by_day = {
        int(row["day_number"]): row
        for row in existing_rows
        if row.get("day_number") not in (None, 0)
    }
    synced_rows: list[dict[str, Any]] = []

    for index, schedule_day in enumerate(working_dates, start=1):
        schedule_date = schedule_day.isoformat()
        row = existing_by_day.get(index)
        is_custom_date = schedule_date in (assignment.get("custom_dates") or [])
        payload = {
            "hours_per_day": hours_per_day,
            "schedule_date": schedule_date,
            "is_custom": is_custom_date,
            "updated_at": datetime.now().isoformat(),
        }

        if row:
            if (
                row.get("hours_per_day") != hours_per_day
                or format_date(row.get("schedule_date")) != schedule_date
                or row.get("is_custom") != is_custom_date
            ):
                row = update_row(
                    "schedules",
                    payload,
                    filters={
                        "id": f"eq.{row['id']}",
                    },
                ) or row
            synced_rows.append(row)
            continue

        created_row = insert_row(
            "schedules",
            {
                "trainer_id": trainer_id,
                "program_id": program_id,
                "day_number": index,
                "hours_per_day": hours_per_day,
                "schedule_date": schedule_date,
                "is_custom": is_custom_date,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
            },
        )
        synced_rows.append(created_row)

    trailing_rows = [
        row for row in existing_rows
        if int(row.get("day_number") or 0) > total_days
        and not row.get("status")
        and not row.get("notes")
    ]
    for row in trailing_rows:
        delete_rows("schedules", filters={"id": f"eq.{row['id']}"}, returning="minimal")

    return synced_rows


def build_assignment_summary(
    trainer: dict[str, Any] | None,
    assignment: dict[str, Any],
    program: dict[str, Any],
    schedule_rows: list[dict[str, Any]] | None = None,
    users_map: dict[int, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    rows = schedule_rows if schedule_rows is not None else load_schedule_rows(
        int(assignment["trainer_id"]),
        int(assignment["program_id"]),
    )
    rows = mark_overdue_schedule_rows_nat(assignment, rows)
    if users_map is None:
        users_map = load_users_map(
            [assignment.get("assigned_by"), assignment.get("approved_by")]
        )

    assigned_user = users_map.get(int(assignment["assigned_by"])) if assignment.get("assigned_by") else None
    approved_user = users_map.get(int(assignment["approved_by"])) if assignment.get("approved_by") else None
    hours_per_day = get_assignment_hours_per_day(assignment, program)
    base_days = calculate_base_days(program, hours_per_day)
    total_days = max(base_days + get_non_complete_day_count(rows), get_last_used_day(rows), base_days)
    total_hours = get_program_total_hours(program)
    marked_days, schedule_total_days = get_schedule_progress_counts(rows)
    approval_status = assignment.get("approval_status") or "for approval"
    progress_status = IN_PROGRESS_STATUS
    if approval_status == "approved" and total_days > 0 and marked_days >= total_days:
        progress_status = "completed"

    return {
        "id": assignment["id"],
        "trainer_id": assignment["trainer_id"],
        "trainer_name": (trainer or {}).get("trainer_name"),
        "program_id": program["id"],
        "program_name": program.get("name"),
        "program_type": program.get("type"),
        "program_validity": program.get("validity"),
        "program_total_hours": total_hours,
        "program_days": total_days,
        "base_program_days": base_days,
        "extension_days": max(total_days - base_days, 0),
        "program_schedule": hours_to_label(hours_per_day),
        "hours_per_day": hours_per_day,
        "approval_status": approval_status,
        "progress_status": progress_status,
        "schedule_marked_days": marked_days,
        "schedule_total_days": schedule_total_days,
        "approval_notes": assignment.get("approval_notes"),
        "schedule_date": assignment.get("schedule_date"),
        "approved_by": assignment.get("approved_by"),
        "approved_by_name": (approved_user or {}).get("full_name") or (approved_user or {}).get("username"),
        "approved_by_position": (approved_user or {}).get("position"),
        "approved_at": assignment.get("approved_at"),
        "nttc_number": assignment.get("nttc_number"),
        "assigned_by": assignment.get("assigned_by"),
        "assigned_by_name": (assigned_user or {}).get("full_name") or (assigned_user or {}).get("username"),
        "assigned_by_position": (assigned_user or {}).get("position"),
        "assigned_by_signature_enabled": assignment.get("assigned_by_signature_enabled") is True,
        "allowed_days": assignment.get("allowed_days") if assignment.get("allowed_days") is not None else [0, 1, 2, 3, 4],
        "custom_dates": assignment.get("custom_dates") if assignment.get("custom_dates") is not None else [],
        "created_at": assignment.get("created_at"),
    }
