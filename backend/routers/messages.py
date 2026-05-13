from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .auth import get_current_user
from ..schemas import (
    AdminUserResponse,
    MessageCreate,
    MessageResponse,
    MessageUpdate,
)
from ..supabase_rest import SupabaseAPIError, insert_row, select_rows, select_one, update_row

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


def _unknown_user() -> dict:
    return {
        "id": None,
        "username": "unknown",
        "full_name": "Unknown",
        "email": UNKNOWN_EMAIL,
        "user_type": None,
    }


def raise_supabase_http(exc: SupabaseAPIError):
    status_code = exc.status_code if 400 <= exc.status_code < 600 else status.HTTP_500_INTERNAL_SERVER_ERROR
    raise HTTPException(status_code=status_code, detail=exc.message) from exc


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
    if current_user.get("user_type") in {"admin", "supervisor"}:
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


def _enrich_message(message: dict, users_map: dict[int, dict]) -> dict:
    sender = users_map.get(message.get("sender_id")) or _unknown_user()
    recipient = users_map.get(message.get("recipient_id")) or _unknown_user()
    message["sender_name"] = sender.get("full_name") or sender.get("username") or "Unknown"
    message["sender_username"] = sender.get("username") or "unknown"
    message["sender_email"] = sender.get("email") or UNKNOWN_EMAIL
    message["recipient_name"] = recipient.get("full_name") or recipient.get("username") or "Unknown"
    message["recipient_username"] = recipient.get("username") or "unknown"
    message["recipient_email"] = recipient.get("email") or UNKNOWN_EMAIL
    return message


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
        visible_user_ids = _load_visible_user_ids(current_user)

        sender_messages = select_rows(
            "messages",
            filters={"sender_id": f"in.({','.join(map(str, sorted(visible_user_ids)))})", "is_deleted_by_sender": FILTER_FALSE},
            order="created_at.desc",
        )

        recipient_messages = select_rows(
            "messages",
            filters={"recipient_id": f"in.({','.join(map(str, sorted(visible_user_ids)))})", "is_deleted_by_recipient": FILTER_FALSE},
            order="created_at.desc",
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
            "message_type": message_data.message_type,
            "priority": message_data.priority,
            "status": "unread",
            "reply_to_id": message_data.reply_to_id,
        }
        
        # Insert the message
        result = insert_row("messages", message)
        
        return result
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc)
        )


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
        if current_user["id"] not in [message["sender_id"], message["recipient_id"]]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=ACCESS_DENIED_MESSAGE
            )
        
        # Mark as read if recipient
        if message["recipient_id"] == current_user["id"] and message["status"] == "unread":
            update_row(
                "messages",
                {
                    "status": "read",
                    "read_at": datetime.now(timezone.utc).isoformat(),
                },
                filters={"id": f"eq.{message_id}"},
            )

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
        visible_user_ids = _load_visible_user_ids(current_user)
        if message["sender_id"] not in visible_user_ids and message["recipient_id"] not in visible_user_ids:
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
            result = update_row("messages", updates, filters={"id": f"eq.{message_id}"})
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

        if current_user["id"] not in [original_message["sender_id"], original_message["recipient_id"]]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED_MESSAGE)

        recipient_id = (
            original_message["sender_id"]
            if current_user["id"] == original_message["recipient_id"]
            else original_message["recipient_id"]
        )

        reply_message = {
            "sender_id": current_user["id"],
            "recipient_id": recipient_id,
            "subject": f"Re: {original_message.get('subject') or ''}".strip(),
            "content": reply_data.get("content", ""),
            "message_type": original_message.get("message_type") or "issue",
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
        visible_user_ids = _load_visible_user_ids(current_user)
        if message["sender_id"] not in visible_user_ids and message["recipient_id"] not in visible_user_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=ACCESS_DENIED_MESSAGE
            )
        
        # Soft delete based on user role
        if message["sender_id"] in visible_user_ids:
            update_row(
                "messages",
                {"is_deleted_by_sender": True},
                filters={"id": f"eq.{message_id}"},
            )
        else:
            update_row(
                "messages",
                {"is_deleted_by_recipient": True},
                filters={"id": f"eq.{message_id}"},
            )
        
        return {"status": "deleted"}
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)


@router.get("/unread-count")
async def get_unread_count(current_user: CurrentUser):
    try:
        if current_user.get("user_type") in {"admin", "supervisor"}:
            visible_user_ids = _load_visible_user_ids(current_user)
            unread_messages = select_rows(
                "messages",
                filters={
                    "recipient_id": f"in.({','.join(map(str, sorted(visible_user_ids)))})",
                    "status": "eq.unread",
                    "is_deleted_by_recipient": FILTER_FALSE,
                },
                select="id",
            )
            return {"count": len(unread_messages)}

        unread_messages = select_rows(
            "messages",
            filters={
                "recipient_id": f"eq.{current_user['id']}",
                "status": "eq.unread",
                "is_deleted_by_recipient": FILTER_FALSE,
            },
            select="id",
        )
        return {"count": len(unread_messages)}
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
