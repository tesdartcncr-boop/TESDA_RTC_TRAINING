import logging
from typing import Any

import socketio

from .routers.auth import resolve_user_from_token
from .supabase_rest import SupabaseAPIError, insert_row

logger = logging.getLogger(__name__)

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://localhost:3004",
        "http://localhost:3005",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3003",
        "http://127.0.0.1:3004",
        "http://127.0.0.1:3005",
    ],
    logger=True,
    engineio_logger=True,
)

connected_users: dict[str, dict[str, Any]] = {}


def _normalize_user_id(user_id):
    try:
        return int(user_id)
    except (TypeError, ValueError):
        return user_id


def _user_room(user_id) -> str:
    return f"user:{_normalize_user_id(user_id)}"


def _extract_token(auth: Any) -> str | None:
    if not isinstance(auth, dict):
        return None

    raw_token = auth.get("token") or auth.get("access_token")
    if not isinstance(raw_token, str):
        return None

    token = raw_token.strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    return token or None


async def _register_authenticated_socket(sid: str, user: dict):
    user_id = _normalize_user_id(user.get("id"))
    user_type = user.get("user_type")
    connected_users[sid] = {
        "id": user_id,
        "username": user.get("username"),
        "user_type": user_type,
    }

    await sio.enter_room(sid, "authenticated")
    await sio.enter_room(sid, _user_room(user_id))
    if user_type in {"admin", "supervisor"}:
        await sio.enter_room(sid, "management")
    if user_type:
        await sio.enter_room(sid, f"role:{user_type}")

    logger.info("Socket %s authenticated for user %s (%s)", sid, user_id, user_type)


async def emit_to_users(event_name, payload, user_ids):
    target_ids = {_normalize_user_id(user_id) for user_id in user_ids if user_id is not None}
    if not target_ids:
        return

    logger.info("Emitting %s to %s user room(s)", event_name, len(target_ids))
    for user_id in target_ids:
        await sio.emit(event_name, payload, room=_user_room(user_id))


@sio.event
async def connect(sid, environ, auth):
    token = _extract_token(auth)
    if not token:
        logger.warning("Rejected socket %s without auth token", sid)
        return False

    try:
        user = resolve_user_from_token(token)
    except Exception:
        logger.exception("Rejected socket %s because token validation failed", sid)
        return False

    await _register_authenticated_socket(sid, user)
    return True


@sio.event
async def disconnect(sid):
    user = connected_users.pop(sid, None)
    if user:
        logger.info("Socket %s disconnected for user %s", sid, user.get("id"))
    else:
        logger.info("Unauthenticated socket %s disconnected", sid)


@sio.event
async def register_user(sid, data):
    user = connected_users.get(sid)
    if not user:
        logger.warning("Socket %s tried to register without authentication", sid)
        await sio.disconnect(sid)
        return

    requested_user_id = _normalize_user_id((data or {}).get("user_id"))
    if requested_user_id is not None and requested_user_id != user.get("id"):
        logger.warning(
            "Socket %s attempted to register as %s but is authenticated as %s",
            sid,
            requested_user_id,
            user.get("id"),
        )
        return

    await sio.emit(
        "socket_registered",
        {"user_id": user.get("id"), "user_type": user.get("user_type")},
        room=sid,
    )
    logger.info("Socket %s confirmed registration for user %s", sid, user.get("id"))


async def send_notification_to_user(user_id: int, title: str, message: str):
    try:
        notification = insert_row(
            "notifications",
            {
                "user_id": user_id,
                "title": title,
                "message": message,
                "is_read": False,
            },
        )
    except SupabaseAPIError:
        logger.exception("Failed to create notification in Supabase")
        return

    await emit_to_users(
        "notification",
        {
            "id": notification.get("id"),
            "title": title,
            "message": message,
            "created_at": notification.get("created_at"),
        },
        [user_id],
    )


async def broadcast_program_update(program_data):
    logger.info("Broadcasting program update: %s", program_data.get("event_type"))
    await sio.emit("program_update", program_data, room="authenticated")


async def broadcast_schedule_update(schedule_data):
    target_rooms = {"management"}
    trainer_user_id = schedule_data.get("trainer_user_id", schedule_data.get("trainer_id"))
    normalized_user_id = _normalize_user_id(trainer_user_id)
    if normalized_user_id is not None:
        target_rooms.add(_user_room(normalized_user_id))

    logger.info(
        "Broadcasting schedule update %s to %s room(s)",
        schedule_data.get("event_type"),
        len(target_rooms),
    )
    for room in target_rooms:
        await sio.emit("schedule_update", schedule_data, room=room)


async def broadcast_activity_update(activity_data):
    logger.info("Broadcasting activity update %s", activity_data.get("action_type"))
    await sio.emit("activity_update", activity_data, room="management")


async def broadcast_trainer_update(trainer_data):
    target_rooms = {"management"}
    trainer_user_id = _normalize_user_id(trainer_data.get("user_id"))
    if trainer_user_id is not None:
        target_rooms.add(_user_room(trainer_user_id))

    logger.info(
        "Broadcasting trainer update %s to %s room(s)",
        trainer_data.get("event_type"),
        len(target_rooms),
    )
    for room in target_rooms:
        await sio.emit("trainer_update", trainer_data, room=room)
