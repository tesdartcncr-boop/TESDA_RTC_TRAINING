import logging

import socketio

from .supabase_rest import SupabaseAPIError, insert_row, select_rows

logger = logging.getLogger(__name__)

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=["http://localhost:3000", "http://localhost:3001"],
    logger=True,
    engineio_logger=True,
)

connected_users = {}


@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")


@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")
    if sid in connected_users:
        del connected_users[sid]


@sio.event
async def register_user(sid, data):
    user_id = data.get("user_id")
    if user_id:
        connected_users[sid] = user_id
        print(f"User {user_id} registered with socket {sid}")


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
    except SupabaseAPIError as exc:
        logger.error("Failed to create notification in Supabase: %s", exc.message)
        return

    for sid, registered_user_id in connected_users.items():
        if registered_user_id == user_id:
            await sio.emit(
                "notification",
                {
                    "id": notification.get("id"),
                    "title": title,
                    "message": message,
                    "created_at": notification.get("created_at"),
                },
                room=sid,
            )
            break


async def broadcast_program_update(program_data):
    await sio.emit("program_update", program_data)


async def broadcast_trainer_update(trainer_data):
    try:
        admin_users = select_rows(
            "users",
            filters={
                "user_type": "eq.admin",
                "is_active": "eq.true",
            },
            select="id",
        )
    except SupabaseAPIError as exc:
        logger.error("Failed to load admin users for socket broadcast: %s", exc.message)
        return

    admin_ids = {admin["id"] for admin in admin_users}
    for sid, registered_user_id in connected_users.items():
        if int(registered_user_id) in admin_ids:
            await sio.emit("trainer_update", trainer_data, room=sid)
