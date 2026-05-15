from typing import Iterable

from .supabase_rest import delete_rows, select_rows, update_rows

MESSAGE_DELETE_BATCH_SIZE = 100


def _chunk_ids(ids: list[int], size: int = MESSAGE_DELETE_BATCH_SIZE) -> Iterable[list[int]]:
    for index in range(0, len(ids), size):
        yield ids[index:index + size]


def _in_filter(ids: list[int]) -> str:
    return f"in.({','.join(map(str, ids))})"


def delete_user_messages(user_id: int):
    delete_rows("message_notifications", filters={"user_id": f"eq.{user_id}"}, returning="minimal")

    direct_messages = select_rows(
        "messages",
        filters={"or": f"(sender_id.eq.{user_id},recipient_id.eq.{user_id})"},
        select="id",
    )
    message_ids = sorted({int(message["id"]) for message in direct_messages if message.get("id") is not None})

    for batch in _chunk_ids(message_ids):
        batch_filter = _in_filter(batch)

        # Preserve replies from other users by breaking the thread link before
        # deleting the original messages that referenced the removed account.
        update_rows("messages", {"reply_to_id": None}, filters={"reply_to_id": batch_filter})
        delete_rows("message_attachments", filters={"message_id": batch_filter}, returning="minimal")
        delete_rows("message_notifications", filters={"message_id": batch_filter}, returning="minimal")
        delete_rows("messages", filters={"id": batch_filter}, returning="minimal")


def delete_user_auth_artifacts(email: str | None):
    if not email:
        return

    delete_rows("otp_verifications", filters={"email": f"eq.{email}"}, returning="minimal")


def reassign_management_history(deleted_user_id: int, replacement_user_id: int):
    if deleted_user_id == replacement_user_id:
        return

    update_rows(
        "programs",
        {"created_by": replacement_user_id},
        filters={"created_by": f"eq.{deleted_user_id}"},
    )
    update_rows(
        "trainer_programs",
        {"assigned_by": replacement_user_id},
        filters={"assigned_by": f"eq.{deleted_user_id}"},
    )
    update_rows(
        "trainer_programs",
        {"approved_by": None},
        filters={"approved_by": f"eq.{deleted_user_id}"},
    )
