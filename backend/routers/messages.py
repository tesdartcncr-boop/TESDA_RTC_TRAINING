from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .auth import get_current_user
from ..activity_updates import log_trainer_activity
from ..schemas import (
    AdminUserResponse,
    MessageCreate,
    MessageResponse,
    MessageUpdate,
)
from ..socket_manager import emit_to_users
from ..supabase_rest import SupabaseAPIError, get_public_error_message, insert_row, select_rows, select_one, update_row

router = APIRouter()
admin_router = APIRouter()
CurrentUser = Annotated[dict, Depends(get_current_user)]

NOT_FOUND_MESSAGE = "Message not found"
ACCESS_DENIED_MESSAGE = "Access denied"
UNKNOWN_EMAIL = "unknown@rtc.local"
FILTER_FALSE = "eq.false"
FILTER_TRUE = "eq.true"
USER_TYPE_ADMIN = "eq.admin"
USER_TYPE_SUPERVISOR = "eq.supervisor"
USER_SELECT_FIELDS = "id,username,full_name,email,user_type"
MANAGEMENT_USER_TYPES = {"admin", "supervisor"}
ALLOWED_MESSAGE_TYPES = {"issue", "inquiry", "report", "other"}
ORDER_CREATED_AT_DESC = "created_at.desc"
DELETED_BY_RECIPIENT_FILTER = "(is_deleted_by_recipient.eq.false,is_deleted_by_recipient.is.null)"
DELETED_BY_SENDER_FILTER = "(is_deleted_by_sender.eq.false,is_deleted_by_sender.is.null)"


def _unknown_user() -> dict:
    return {
        "id": None,
        "username": "unknown",
        "full_name": "Unknown",
        "email": UNKNOWN_EMAIL,
        "user_type": None,
    }


def _normalize_user_type(user_type: str | None) -> str | None:
    if not isinstance(user_type, str):
        return None
    return user_type.strip().lower()


def _normalize_message_type(message_type: str | None) -> str:
    normalized = (message_type or "").strip().lower()
    return normalized if normalized in ALLOWED_MESSAGE_TYPES else "other"


def raise_supabase_http(exc: SupabaseAPIError):
    status_code = exc.status_code if 400 <= exc.status_code < 600 else status.HTTP_500_INTERNAL_SERVER_ERROR
    raise HTTPException(status_code=status_code, detail=get_public_error_message(exc)) from exc


def get_user_or_404(user_id: int) -> dict:
    user = select_one("users", filters={"id": f"eq.{user_id}"})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _load_users_map(user_ids: set[int]) -> dict[int, dict]:
    if not user_ids:
        return {}

    users = select_rows(
        "users",
        filters={"id": f"in.({','.join(map(str, sorted(user_ids)))})"},
        select=USER_SELECT_FIELDS,
    )
    return {user["id"]: user for user in users}


def _load_visible_user_ids(current_user: dict) -> set[int]:
    if _normalize_user_type(current_user.get("user_type")) in MANAGEMENT_USER_TYPES:
        admin_users = select_rows(
            "users",
            filters={"user_type": USER_TYPE_ADMIN, "is_active": FILTER_TRUE},
            select="id",
        )
        supervisor_users = select_rows(
            "users",
            filters={"user_type": USER_TYPE_SUPERVISOR, "is_active": FILTER_TRUE},
            select="id",
        )
        return {user["id"] for user in admin_users + supervisor_users}

    return {current_user["id"]}


def _load_management_user_ids() -> set[int]:
    admin_users = select_rows(
        "users",
        filters={"user_type": USER_TYPE_ADMIN, "is_active": FILTER_TRUE},
        select="id",
    )
    supervisor_users = select_rows(
        "users",
        filters={"user_type": USER_TYPE_SUPERVISOR, "is_active": FILTER_TRUE},
        select="id",
    )
    return {user["id"] for user in admin_users + supervisor_users}


def _load_trainer_by_user_id(user_id: int | None) -> dict | None:
    if user_id is None:
        return None

    return select_one(
        "trainers",
        filters={"user_id": f"eq.{user_id}"},
        select="id,user_id,username,trainer_name",
    )


async def _broadcast_message_event(event_type: str, message: dict, targets: set[int]):
    payload = {
        "event_type": event_type,
        "message_id": message.get("id"),
        "sender_id": message.get("sender_id"),
        "recipient_id": message.get("recipient_id"),
        "reply_to_id": message.get("reply_to_id"),
        "data": message,
    }
    await emit_to_users(event_type, payload, targets)


def _message_event_targets(message: dict) -> set[int]:
    targets = {message.get("sender_id"), message.get("recipient_id")}
    targets.update(_load_management_user_ids())
    return {target for target in targets if target is not None}


def _message_has_access(current_user: dict, message: dict) -> bool:
    if _normalize_user_type(current_user.get("user_type")) in MANAGEMENT_USER_TYPES:
        visible_user_ids = _load_visible_user_ids(current_user)
        return message["sender_id"] in visible_user_ids or message["recipient_id"] in visible_user_ids

    return current_user["id"] in [message["sender_id"], message["recipient_id"]]


def _resolve_reply_recipient_id(current_user: dict, original_message: dict) -> int:
    if _normalize_user_type(current_user.get("user_type")) not in MANAGEMENT_USER_TYPES:
        return (
            original_message["sender_id"]
            if current_user["id"] == original_message["recipient_id"]
            else original_message["recipient_id"]
        )

    visible_user_ids = _load_visible_user_ids(current_user)
    sender_is_management = original_message["sender_id"] in visible_user_ids
    recipient_is_management = original_message["recipient_id"] in visible_user_ids

    if not sender_is_management:
        return original_message["sender_id"]
    if not recipient_is_management:
        return original_message["recipient_id"]
    if current_user["id"] == original_message["recipient_id"]:
        return original_message["sender_id"]
    return original_message["recipient_id"]


def _enrich_message(message: dict, users_map: dict[int, dict]) -> dict:
    sender = users_map.get(message.get("sender_id")) or _unknown_user()
    recipient = users_map.get(message.get("recipient_id")) or _unknown_user()
    message["sender_name"] = sender.get("full_name") or sender.get("username") or "Unknown"
    message["sender_username"] = sender.get("username") or "unknown"
    message["sender_email"] = sender.get("email") or UNKNOWN_EMAIL
    message["sender_user_type"] = _normalize_user_type(sender.get("user_type"))
    message["recipient_name"] = recipient.get("full_name") or recipient.get("username") or "Unknown"
    message["recipient_username"] = recipient.get("username") or "unknown"
    message["recipient_email"] = recipient.get("email") or UNKNOWN_EMAIL
    message["recipient_user_type"] = _normalize_user_type(recipient.get("user_type"))
    return message


def _dedupe_messages(messages: list[dict]) -> list[dict]:
    unique_messages: dict[int, dict] = {}
    for message in messages:
        unique_messages[message["id"]] = message
    return list(unique_messages.values())


@router.get("")
async def get_messages(
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: str = Query("all", pattern="^(all|unread|read|replied)$"),
    search: str | None = Query(None),
):
    """Get all messages sent by or to the current user."""
    try:
        user_type = _normalize_user_type(current_user.get("user_type"))

        if user_type in MANAGEMENT_USER_TYPES:
            visible_user_ids = _load_visible_user_ids({**current_user, "user_type": user_type})
            sender_messages = select_rows(
                "messages",
                filters={
                    "sender_id": f"in.({','.join(map(str, sorted(visible_user_ids)))})",
                    "or": DELETED_BY_SENDER_FILTER,
                },
                order=ORDER_CREATED_AT_DESC,
            )
            recipient_messages = select_rows(
                "messages",
                filters={
                    "recipient_id": f"in.({','.join(map(str, sorted(visible_user_ids)))})",
                    "or": DELETED_BY_RECIPIENT_FILTER,
                },
                order=ORDER_CREATED_AT_DESC,
            )
            all_messages = _dedupe_messages(sender_messages + recipient_messages)
        else:
            sender_messages = select_rows(
                "messages",
                filters={
                    "sender_id": f"eq.{current_user['id']}",
                    "or": DELETED_BY_SENDER_FILTER,
                },
                order=ORDER_CREATED_AT_DESC,
            )


            recipient_messages = select_rows(
                "messages",
                filters={
                    "recipient_id": f"eq.{current_user['id']}",
                    "or": DELETED_BY_RECIPIENT_FILTER,
                },
                order=ORDER_CREATED_AT_DESC,
            )
            all_messages = sender_messages + recipient_messages

        if status != "all":
            all_messages = [message for message in all_messages if message.get("status") == status]

        all_messages.sort(key=lambda message: message.get("created_at") or "", reverse=True)

        users_map = _load_users_map(
            {message["sender_id"] for message in all_messages}
            | {message["recipient_id"] for message in all_messages}
        )
        enriched_messages = [_enrich_message(message, users_map) for message in all_messages]

        if search:
            search_lower = search.lower()
            enriched_messages = [
                message
                for message in enriched_messages
                if search_lower in (message.get("subject") or "").lower()
                or search_lower in (message.get("content") or "").lower()
                or search_lower in (message.get("sender_name") or "").lower()
                or search_lower in (message.get("recipient_name") or "").lower()
            ]

        start = (page - 1) * limit
        end = start + limit
        total = len(enriched_messages)
        total_pages = (total + limit - 1) // limit if total else 0

        return {
            "data": enriched_messages[start:end],
            "currentPage": page,
            "totalPages": total_pages,
            "pageSize": limit,
            "total": total,
            "sent_count": len(sender_messages),
            "received_count": len(recipient_messages),
            "hasMore": page < total_pages,
        }
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.post("")
async def create_message(
    message_data: MessageCreate,
    current_user: CurrentUser
):
    """Send a new message to a recipient"""
    try:
        # Verify recipient exists
        get_user_or_404(message_data.recipient_id)
        
        # Prepare the message
        message = {
            "sender_id": current_user["id"],
            "recipient_id": message_data.recipient_id,
            "subject": message_data.subject,
            "content": message_data.content,
            "message_type": _normalize_message_type(message_data.message_type),
            "priority": message_data.priority,
            "status": "unread",
            "reply_to_id": message_data.reply_to_id,
        }
        
        # Insert the message
        result = insert_row("messages", message)
        await _broadcast_message_event("new_message", result, _message_event_targets(result))

        if _normalize_user_type(current_user.get("user_type")) == "trainer":
            trainer = _load_trainer_by_user_id(current_user.get("id"))
            trainer_name = (trainer or {}).get("trainer_name") or current_user.get("full_name") or current_user.get("username") or "Trainer"
            await log_trainer_activity(
                actor_user_id=current_user.get("id"),
                trainer_id=(trainer or {}).get("id"),
                message_id=result.get("id"),
                action_type="message_sent",
                action_label="Message sent",
                details=f"{trainer_name} sent a message: {message_data.subject}.",
                metadata={
                    "subject": message_data.subject,
                    "recipient_id": message_data.recipient_id,
                },
            )
        
        return result
    except HTTPException:
        raise
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc)
        )


@router.get("/unread-count")
async def get_unread_count(current_user: CurrentUser):
    try:
        if _normalize_user_type(current_user.get("user_type")) in MANAGEMENT_USER_TYPES:
            visible_user_ids = _load_visible_user_ids(current_user)
            unread_messages = select_rows(
                "messages",
                filters={
                    "recipient_id": f"in.({','.join(map(str, sorted(visible_user_ids)))})",
                    "status": "eq.unread",
                    "or": DELETED_BY_RECIPIENT_FILTER,
                },
                select="id",
            )
            return {"count": len(unread_messages)}

        unread_messages = select_rows(
            "messages",
            filters={
                "recipient_id": f"eq.{current_user['id']}",
                "status": "eq.unread",
                "or": DELETED_BY_RECIPIENT_FILTER,
            },
            select="id",
        )
        return {"count": len(unread_messages)}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/updates")
async def get_activity_updates(
    current_user: CurrentUser,
    limit: int = Query(100, ge=1, le=200),
):
    if _normalize_user_type(current_user.get("user_type")) not in MANAGEMENT_USER_TYPES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED_MESSAGE)

    try:
        updates = select_rows(
            "trainer_activity_updates",
            order=ORDER_CREATED_AT_DESC,
            limit=limit,
        )

        actor_ids = {update.get("actor_user_id") for update in updates if update.get("actor_user_id") is not None}
        trainer_ids = {update.get("trainer_id") for update in updates if update.get("trainer_id") is not None}
        program_ids = {update.get("program_id") for update in updates if update.get("program_id") is not None}

        users_map = _load_users_map(actor_ids)
        trainers_map = {}
        programs_map = {}

        if trainer_ids:
            trainers = select_rows(
                "trainers",
                filters={"id": f"in.({','.join(map(str, sorted(trainer_ids)))})"},
                select="id,trainer_name,username",
            )
            trainers_map = {trainer["id"]: trainer for trainer in trainers}

        if program_ids:
            programs = select_rows(
                "programs",
                filters={"id": f"in.({','.join(map(str, sorted(program_ids)))})"},
                select="id,name,type",
            )
            programs_map = {program["id"]: program for program in programs}

        enriched_updates = []
        for update in updates:
            actor = users_map.get(update.get("actor_user_id")) or _unknown_user()
            trainer = trainers_map.get(update.get("trainer_id")) or {}
            program = programs_map.get(update.get("program_id")) or {}
            enriched_updates.append(
                {
                    **update,
                    "actor_name": actor.get("full_name") or actor.get("username") or "Unknown",
                    "actor_username": actor.get("username") or "unknown",
                    "actor_user_type": _normalize_user_type(actor.get("user_type")),
                    "trainer_name": trainer.get("trainer_name") or trainer.get("username"),
                    "program_name": program.get("name"),
                    "program_type": program.get("type"),
                }
            )

        return {"data": enriched_updates}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/{message_id}")
async def get_message(
    message_id: int,
    current_user: CurrentUser
):
    """Get a specific message"""
    try:
        message = select_one("messages", filters={"id": f"eq.{message_id}"})
        if not message:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=NOT_FOUND_MESSAGE
            )
        
        # Check if user has access to this message
        if _normalize_user_type(current_user.get("user_type")) in MANAGEMENT_USER_TYPES:
            visible_user_ids = _load_visible_user_ids(current_user)
            has_access = message["recipient_id"] in visible_user_ids or message["sender_id"] in visible_user_ids
        else:
            has_access = current_user["id"] in [message["sender_id"], message["recipient_id"]]

        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=ACCESS_DENIED_MESSAGE
            )
        
        # Mark as read if recipient
        if message["recipient_id"] == current_user["id"] and message["status"] == "unread":
            read_at = datetime.now(timezone.utc).isoformat()
            update_row(
                "messages",
                {
                    "status": "read",
                    "read_at": read_at,
                },
                filters={"id": f"eq.{message_id}"},
            )
            message["status"] = "read"
            message["read_at"] = read_at
            await _broadcast_message_event("message_update", {**message, "event_type": "message_read"}, _message_event_targets(message))

        users_map = _load_users_map({message["sender_id"], message["recipient_id"]})
        message = _enrich_message(message, users_map)
        
        return message
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.put("/{message_id}")
async def update_message(
    message_id: int,
    update_data: MessageUpdate,
    current_user: CurrentUser
):
    """Update a message (status, priority)"""
    try:
        message = select_one("messages", filters={"id": f"eq.{message_id}"})
        if not message:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=NOT_FOUND_MESSAGE
            )
        
        # Check if user has access
        if _normalize_user_type(current_user.get("user_type")) in MANAGEMENT_USER_TYPES:
            visible_user_ids = _load_visible_user_ids(current_user)
            has_access = message["sender_id"] in visible_user_ids or message["recipient_id"] in visible_user_ids
        else:
            has_access = current_user["id"] in [message["sender_id"], message["recipient_id"]]

        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=ACCESS_DENIED_MESSAGE
            )
        
        updates = {}
        if update_data.status:
            updates["status"] = update_data.status
            if update_data.status == "read":
                updates["read_at"] = datetime.now(timezone.utc).isoformat()
        if update_data.priority:
            updates["priority"] = update_data.priority
        
        if updates:
            result = update_row("messages", updates, filters={"id": f"eq.{message_id}"}) or {**message, **updates}
            await _broadcast_message_event("message_update", {**result, "event_type": "message_updated"}, _message_event_targets(result))
            return result
        return message
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.put("/{message_id}/reply")
async def reply_to_message(
    message_id: int,
    reply_data: dict,
    current_user: CurrentUser
):
    """Reply to an existing message."""
    try:
        original_message = select_one("messages", filters={"id": f"eq.{message_id}"})
        if not original_message:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_MESSAGE)

        if not _message_has_access(current_user, original_message):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED_MESSAGE)

        recipient_id = _resolve_reply_recipient_id(current_user, original_message)

        reply_message = {
            "sender_id": current_user["id"],
            "recipient_id": recipient_id,
            "subject": f"Re: {original_message.get('subject') or ''}".strip(),
            "content": reply_data.get("content", ""),
            "message_type": _normalize_message_type(original_message.get("message_type")),
            "priority": reply_data.get("priority") or "normal",
            "status": "unread",
            "reply_to_id": message_id,
        }

        result = insert_row("messages", reply_message)
        if result:
            try:
                insert_row(
                    "message_notifications",
                    {
                        "user_id": recipient_id,
                        "message_id": result["id"],
                        "is_read": False,
                    },
                )
            except Exception:
                pass

        update_row("messages", {"status": "replied"}, filters={"id": f"eq.{message_id}"})
        original_message = {**original_message, "status": "replied"}
        await _broadcast_message_event("message_update", {**original_message, "event_type": "message_replied"}, _message_event_targets(original_message))
        await _broadcast_message_event("new_message", {**result, "event_type": "message_reply"}, _message_event_targets(result))
        if _normalize_user_type(current_user.get("user_type")) == "trainer":
            trainer = _load_trainer_by_user_id(current_user.get("id"))
            trainer_name = (trainer or {}).get("trainer_name") or current_user.get("full_name") or current_user.get("username") or "Trainer"
            await log_trainer_activity(
                actor_user_id=current_user.get("id"),
                trainer_id=(trainer or {}).get("id"),
                message_id=result.get("id"),
                action_type="message_sent",
                action_label="Message reply sent",
                details=f"{trainer_name} replied to a message: {original_message.get('subject') or '(No subject)'}.",
                metadata={
                    "subject": original_message.get("subject"),
                    "reply_to_id": message_id,
                    "recipient_id": recipient_id,
                },
            )
        return result
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.delete("/{message_id}")
async def delete_message(
    message_id: int,
    current_user: CurrentUser
):
    """Soft delete a message for the current user"""
    try:
        message = select_one("messages", filters={"id": f"eq.{message_id}"})
        if not message:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=NOT_FOUND_MESSAGE
            )
        
        # Check if user has access
        if _normalize_user_type(current_user.get("user_type")) in MANAGEMENT_USER_TYPES:
            visible_user_ids = _load_visible_user_ids(current_user)
            if message["sender_id"] not in visible_user_ids and message["recipient_id"] not in visible_user_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=ACCESS_DENIED_MESSAGE
                )

            # For management inbox, prefer deleting from recipient side when the
            # message is in any management recipient mailbox.
            if message["recipient_id"] in visible_user_ids:
                update_row(
                    "messages",
                    {"is_deleted_by_recipient": True},
                    filters={"id": f"eq.{message_id}"},
                )
            else:
                update_row(
                    "messages",
                    {"is_deleted_by_sender": True},
                    filters={"id": f"eq.{message_id}"},
                )
        elif message["sender_id"] == current_user["id"]:
            update_row(
                "messages",
                {"is_deleted_by_sender": True},
                filters={"id": f"eq.{message_id}"},
            )
        elif message["recipient_id"] == current_user["id"]:
            update_row(
                "messages",
                {"is_deleted_by_recipient": True},
                filters={"id": f"eq.{message_id}"},
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=ACCESS_DENIED_MESSAGE
            )

        await _broadcast_message_event("message_update", {**message, "event_type": "message_deleted"}, _message_event_targets(message))
        
        return {"status": "deleted"}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/admin/all-users")
async def get_admin_users(current_user: CurrentUser):
    """Get all admin and supervisor users for sending messages"""
    try:
        admin_users = select_rows(
            "users",
            filters={"user_type": USER_TYPE_ADMIN, "is_active": FILTER_TRUE},
            select=USER_SELECT_FIELDS,
        )
        supervisor_users = select_rows(
            "users",
            filters={"user_type": USER_TYPE_SUPERVISOR, "is_active": FILTER_TRUE},
            select=USER_SELECT_FIELDS,
        )

        return admin_users + supervisor_users
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@admin_router.get("/api/admin-users")
async def get_admin_users_endpoint(current_user: CurrentUser):
    """Get all admin and supervisor users for sending messages - convenience endpoint"""
    try:
        admin_users = select_rows(
            "users",
            filters={"user_type": USER_TYPE_ADMIN, "is_active": FILTER_TRUE},
            select=USER_SELECT_FIELDS,
        )
        supervisor_users = select_rows(
            "users",
            filters={"user_type": USER_TYPE_SUPERVISOR, "is_active": FILTER_TRUE},
            select=USER_SELECT_FIELDS,
        )

        return admin_users + supervisor_users
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
