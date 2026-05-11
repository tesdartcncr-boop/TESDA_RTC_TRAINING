import math
from datetime import date, datetime, timedelta
from typing import Any

from .supabase_rest import SupabaseAPIError, delete_rows, insert_row, select_rows, update_row

DEFAULT_HOURS_PER_DAY = 8
VALID_HOURS_PER_DAY = {4, 8}
VALID_STATUSES = {"complete", "absent", "leave", "suspended", "incomplete"}
NON_COMPLETE_STATUSES = {"absent", "leave", "suspended", "incomplete"}


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


def build_working_dates(start_date: date, total_days: int) -> list[date]:
    dates: list[date] = []
    current = start_date

    while len(dates) < total_days:
        if current.weekday() < 5:
            dates.append(current)
        current += timedelta(days=1)

    return dates


def get_non_complete_day_count(schedule_rows: list[dict[str, Any]]) -> int:
    return sum(1 for row in schedule_rows if row.get("status") in NON_COMPLETE_STATUSES)


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


def sync_assignment_schedule(assignment: dict[str, Any], program: dict[str, Any]) -> list[dict[str, Any]]:
    trainer_id = int(assignment["trainer_id"])
    program_id = int(assignment["program_id"])
    hours_per_day = get_assignment_hours_per_day(assignment, program)
    start_date = parse_date(assignment.get("schedule_date")) or date.today()
    existing_rows = load_schedule_rows(trainer_id, program_id)

    base_days = calculate_base_days(program, hours_per_day)
    non_complete_days = get_non_complete_day_count(existing_rows)
    required_days = base_days + non_complete_days
    total_days = max(required_days, get_last_used_day(existing_rows))

    if total_days <= 0:
        total_days = base_days

    working_dates = build_working_dates(start_date, total_days) if total_days > 0 else []
    existing_by_day = {
        int(row["day_number"]): row
        for row in existing_rows
        if row.get("day_number") not in (None, 0)
    }
    synced_rows: list[dict[str, Any]] = []

    for index, schedule_day in enumerate(working_dates, start=1):
        schedule_date = schedule_day.isoformat()
        row = existing_by_day.get(index)
        payload = {
            "hours_per_day": hours_per_day,
            "schedule_date": schedule_date,
            "updated_at": datetime.now().isoformat(),
        }

        if row:
            if (
                row.get("hours_per_day") != hours_per_day
                or format_date(row.get("schedule_date")) != schedule_date
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
) -> dict[str, Any]:
    rows = schedule_rows if schedule_rows is not None else load_schedule_rows(
        int(assignment["trainer_id"]),
        int(assignment["program_id"]),
    )
    hours_per_day = get_assignment_hours_per_day(assignment, program)
    base_days = calculate_base_days(program, hours_per_day)
    total_days = max(base_days + get_non_complete_day_count(rows), get_last_used_day(rows), base_days)
    total_hours = get_program_total_hours(program)

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
        "approval_status": assignment.get("approval_status") or "for approval",
        "approval_notes": assignment.get("approval_notes"),
        "schedule_date": assignment.get("schedule_date"),
        "approved_by": assignment.get("approved_by"),
        "approved_at": assignment.get("approved_at"),
        "nttc_number": assignment.get("nttc_number"),
        "created_at": assignment.get("created_at"),
    }

