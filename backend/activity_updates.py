import logging
from typing import Any

from .socket_manager import broadcast_activity_update
from .supabase_rest import SupabaseAPIError, insert_row

logger = logging.getLogger(__name__)


async def log_trainer_activity(
    *,
    actor_user_id: int | None,
    trainer_id: int | None = None,
    program_id: int | None = None,
    schedule_id: int | None = None,
    message_id: int | None = None,
    action_type: str,
    action_label: str,
    details: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    payload = {
        "actor_user_id": actor_user_id,
        "trainer_id": trainer_id,
        "program_id": program_id,
        "schedule_id": schedule_id,
        "message_id": message_id,
        "action_type": action_type,
        "action_label": action_label,
        "details": details,
        "metadata": metadata or {},
    }

    try:
        activity = insert_row("trainer_activity_updates", payload)
    except SupabaseAPIError:
        logger.exception("Failed to create trainer activity update")
        return None

    await broadcast_activity_update(activity)
    return activity
