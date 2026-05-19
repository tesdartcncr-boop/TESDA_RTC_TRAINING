import bcrypt
import hashlib
import logging
import os
import random
import secrets
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from ..schemas import (
    LoginRequest,
    OTPRequest,
    OTPVerify,
    PasswordResetConfirm,
    PasswordResetRequest,
    Token,
    TrainerResponse,
    UserResponse,
)
from ..supabase_rest import SupabaseAPIError, delete_rows, get_public_error_message, insert_row, select_one, update_row

env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)

router = APIRouter()
security = HTTPBearer()
logger = logging.getLogger(__name__)

FILTER_FALSE = "eq.false"
FILTER_TRUE = "eq.true"
OTP_PURPOSE_ADMIN_LOGIN = "admin_login"
OTP_PURPOSE_PASSWORD_RESET = "password_reset"

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REMEMBER_ME_EXPIRE_DAYS = int(os.getenv("REMEMBER_ME_EXPIRE_DAYS", "30"))
OTP_EXPIRY_MINUTES = int(os.getenv("OTP_EXPIRY_MINUTES", "10"))


def raise_supabase_http(exc: SupabaseAPIError):
    status_code = exc.status_code if 400 <= exc.status_code < 600 else status.HTTP_500_INTERNAL_SERVER_ERROR
    raise HTTPException(status_code=status_code, detail=get_public_error_message(exc)) from exc


def _prehash_password(password: str) -> bytes:
    return hashlib.sha256(password.encode("utf-8")).hexdigest().encode("utf-8")


def verify_password(plain_password: str, hashed_password: str | bytes | None) -> bool:
    if not hashed_password:
        return False

    hashed_bytes = hashed_password.encode("utf-8") if isinstance(hashed_password, str) else hashed_password
    raw_bytes = plain_password.encode("utf-8")
    candidates = []

    if len(raw_bytes) <= 72:
        candidates.append(raw_bytes)
    candidates.append(_prehash_password(plain_password))

    seen = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        try:
            if bcrypt.checkpw(candidate, hashed_bytes):
                return True
        except ValueError:
            continue

    return False


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(_prehash_password(password), bcrypt.gensalt()).decode("utf-8")


def generate_internal_password() -> str:
    return secrets.token_hex(16)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire.timestamp()})
    logger.info("Creating token with expiry: %s (timestamp: %s)", expire, expire.timestamp())
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def send_otp_email(email: str, otp_code: str):
    smtp_host = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port_raw = os.getenv("SMTP_PORT", "587")
    smtp_username = (os.getenv("SMTP_USERNAME") or "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD") or ""

    if not smtp_username or not smtp_password:
        logger.error("SMTP_USERNAME and SMTP_PASSWORD must be set.")
        return False, "OTP email service is not configured on the server."

    try:
        smtp_port = int(smtp_port_raw)
    except ValueError:
        logger.error("Invalid SMTP_PORT value: %s", smtp_port_raw)
        return False, "OTP email service is not configured on the server."

    message = EmailMessage()
    message["Subject"] = "Trainer Portal - OTP Verification"
    message["From"] = smtp_username
    message["To"] = email
    message.set_content(
        f"Your Trainer Portal OTP code is {otp_code}. It expires in {OTP_EXPIRY_MINUTES} minutes."
    )
    message.add_alternative(
        f"""
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h2 style="margin-bottom: 16px;">Trainer Portal - OTP Verification</h2>
          <p>Your OTP code is: <strong style="font-size: 20px;">{otp_code}</strong></p>
          <p>This code will expire in {OTP_EXPIRY_MINUTES} minutes.</p>
          <p>If you did not request this OTP, you can ignore this email.</p>
        </div>
        """,
        subtype="html",
    )

    try:
        if smtp_port == 465:
            context = ssl.SSLContext(ssl.PROTOCOL_TLSv1_2)
            context.check_hostname = True
            context.verify_mode = ssl.CERT_REQUIRED
            context.load_default_certs()
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30, context=context) as server:
                server.login(smtp_username, smtp_password)
                server.send_message(message)
        else:
            context = ssl.SSLContext(ssl.PROTOCOL_TLSv1_2)
            context.check_hostname = True
            context.verify_mode = ssl.CERT_REQUIRED
            context.load_default_certs()
            with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(smtp_username, smtp_password)
                server.send_message(message)

        return True, None
    except smtplib.SMTPAuthenticationError:
        logger.exception("SMTP authentication failed while sending OTP email")
        return False, "Unable to send OTP email. Please verify the Gmail app password."
    except Exception as exc:
        logger.exception("Failed to send OTP email: %s", exc)
        return False, "Unable to send OTP email. Please try again."


def generate_otp() -> str:
    return str(random.randint(100000, 999999))


def get_authorized_admin_email(email: str):
    return select_one(
        "verified_admin_emails",
        filters={
            "email": f"eq.{normalize_email(email)}",
            "is_active": FILTER_TRUE,
        },
    )


def get_user_by_username(username: str):
    return select_one("users", filters={"username": f"eq.{username}"})


def get_user_by_email(email: str):
    return select_one("users", filters={"email": f"eq.{normalize_email(email)}"})


def build_unique_username(email: str) -> str:
    base_username = email.split("@")[0]
    username = base_username
    suffix = 1

    while get_user_by_username(username):
        username = f"{base_username}_{suffix}"
        suffix += 1

    return username


def serialize_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "full_name": user.get("full_name"),
        "user_type": user["user_type"],
        "is_active": user.get("is_active", True),
        "created_at": user.get("created_at"),
    }


def _delete_pending_otps(email: str, purpose: str):
    delete_rows(
        "otp_verifications",
        filters={
            "email": f"eq.{email}",
            "purpose": f"eq.{purpose}",
            "is_verified": FILTER_FALSE,
        },
        returning="minimal",
    )


def _create_otp_record(email: str, otp_code: str, purpose: str):
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)
    return insert_row(
        "otp_verifications",
        {
            "email": email,
            "purpose": purpose,
            "otp_code": otp_code,
            "is_verified": False,
            "expires_at": expires_at,
        },
    )


def _cleanup_unsent_otp(email: str, otp_code: str, purpose: str):
    try:
        delete_rows(
            "otp_verifications",
            filters={
                "email": f"eq.{email}",
                "purpose": f"eq.{purpose}",
                "otp_code": f"eq.{otp_code}",
                "is_verified": FILTER_FALSE,
            },
            returning="minimal",
        )
    except SupabaseAPIError:
        logger.warning("Failed to clean up unsent OTP for %s", email)


def _select_valid_otp(email: str, otp_code: str, purpose: str):
    now_iso = datetime.now(timezone.utc).isoformat()
    return select_one(
        "otp_verifications",
        filters={
            "email": f"eq.{email}",
            "purpose": f"eq.{purpose}",
            "otp_code": f"eq.{otp_code}",
            "is_verified": FILTER_FALSE,
            "expires_at": f"gt.{now_iso}",
        },
        order="id.desc",
    )


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    try:
        user = get_user_by_username(username)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not user:
        raise credentials_exception
    if user.get("is_active") is False:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated",
        )
    return user


CurrentUser = Annotated[dict, Depends(get_current_user)]


@router.post("/login", response_model=Token)
async def login(login_data: LoginRequest):
    try:
        user = get_user_by_username(login_data.username)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not user or not verify_password(login_data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    if user.get("is_active") is False:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated",
        )

    token_expiry = timedelta(days=REMEMBER_ME_EXPIRE_DAYS) if login_data.remember_me else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"], "user_type": user["user_type"]},
        expires_delta=token_expiry,
    )
    logger.info("User logged in: %s, remember_me: %s, expiry: %s", user["username"], login_data.remember_me, token_expiry)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": serialize_user(user),
    }


@router.post("/password-reset/request")
async def request_password_reset(payload: PasswordResetRequest):
    normalized_email = normalize_email(payload.email)

    try:
        user = get_user_by_email(normalized_email)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not user or user.get("is_active") is False:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active account found for this email address.",
        )

    otp_code = generate_otp()
    try:
        _delete_pending_otps(normalized_email, OTP_PURPOSE_PASSWORD_RESET)
        _create_otp_record(normalized_email, otp_code, OTP_PURPOSE_PASSWORD_RESET)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    email_sent, error_message = send_otp_email(normalized_email, otp_code)
    if email_sent:
        return {"message": "OTP sent successfully"}

    _cleanup_unsent_otp(normalized_email, otp_code, OTP_PURPOSE_PASSWORD_RESET)
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=error_message or "Failed to send OTP",
    )


@router.post("/password-reset/confirm")
async def confirm_password_reset(payload: PasswordResetConfirm):
    normalized_email = normalize_email(payload.email)

    try:
        user = get_user_by_email(normalized_email)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not user or user.get("is_active") is False:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active account found for this email address.",
        )

    try:
        otp_record = _select_valid_otp(normalized_email, payload.otp_code, OTP_PURPOSE_PASSWORD_RESET)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP",
        )

    try:
        update_row(
            "users",
            {"password_hash": get_password_hash(payload.new_password)},
            filters={"id": f"eq.{user['id']}"},
        )
        update_row(
            "otp_verifications",
            {"is_verified": True},
            filters={"id": f"eq.{otp_record['id']}"},
        )
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    return {"message": "Password reset successful"}


@router.post("/send-otp")
async def send_otp(otp_request: OTPRequest):
    normalized_email = normalize_email(otp_request.email)

    try:
        verified_email = get_authorized_admin_email(normalized_email)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not verified_email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email is not authorized for admin access",
        )

    otp_code = generate_otp()
    try:
        _delete_pending_otps(normalized_email, OTP_PURPOSE_ADMIN_LOGIN)
        _create_otp_record(normalized_email, otp_code, OTP_PURPOSE_ADMIN_LOGIN)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    email_sent, error_message = send_otp_email(normalized_email, otp_code)
    if email_sent:
        return {"message": "OTP sent successfully"}

    _cleanup_unsent_otp(normalized_email, otp_code, OTP_PURPOSE_ADMIN_LOGIN)
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=error_message or "Failed to send OTP",
    )


@router.post("/verify-otp")
async def verify_otp(otp_verify: OTPVerify):
    normalized_email = normalize_email(otp_verify.email)

    try:
        verified_email = get_authorized_admin_email(normalized_email)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not verified_email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email is not authorized for admin access",
        )

    try:
        otp_record = _select_valid_otp(normalized_email, otp_verify.otp_code, OTP_PURPOSE_ADMIN_LOGIN)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP",
        )

    try:
        admin_user = get_user_by_email(normalized_email)
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if admin_user and admin_user.get("user_type") != "admin":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This authorized email already belongs to a non-admin user.",
        )

    if not admin_user:
        try:
            admin_user = insert_row(
                "users",
                {
                    "username": build_unique_username(normalized_email),
                    "email": normalized_email,
                    "full_name": "OTP Admin",
                    "password_hash": get_password_hash(generate_internal_password()),
                    "user_type": "admin",
                    "is_active": True,
                },
            )
        except SupabaseAPIError as exc:
            raise_supabase_http(exc)
        except Exception as exc:
            logger.exception("Failed to create admin user during OTP verification: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create admin user.",
            ) from exc

    try:
        update_row(
            "otp_verifications",
            {"is_verified": True},
            filters={"id": f"eq.{otp_record['id']}"},
        )
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    access_token = create_access_token(
        data={"sub": admin_user["username"], "user_type": admin_user["user_type"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": serialize_user(admin_user),
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: CurrentUser):
    return serialize_user(current_user)


@router.get("/trainer/me", response_model=TrainerResponse)
async def get_trainer_info(current_user: CurrentUser):
    if current_user.get("user_type") != "trainer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Trainer access required.",
        )

    try:
        trainer = select_one("trainers", filters={"username": f"eq.{current_user['username']}"})
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    if not trainer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trainer profile not found",
        )

    return trainer
