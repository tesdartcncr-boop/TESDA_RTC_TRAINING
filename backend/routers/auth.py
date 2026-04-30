import bcrypt
import hashlib
import logging
import os
import random
import secrets
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from schemas import LoginRequest, OTPRequest, OTPVerify, Token, TrainerResponse, UserResponse
from supabase_rest import SupabaseAPIError, delete_rows, insert_row, select_one, update_row

env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)

router = APIRouter()
security = HTTPBearer()
logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
OTP_EXPIRY_MINUTES = int(os.getenv("OTP_EXPIRY_MINUTES", "10"))
OTP_EMAIL_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "send_otp_email.js"


def raise_supabase_http(exc: SupabaseAPIError):
    status_code = exc.status_code if 400 <= exc.status_code < 600 else status.HTTP_500_INTERNAL_SERVER_ERROR
    raise HTTPException(status_code=status_code, detail=exc.message) from exc


def _prehash_password(password: str) -> bytes:
    return hashlib.sha256(password.encode("utf-8")).hexdigest().encode("utf-8")


def verify_password(plain_password, hashed_password):
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


def get_password_hash(password):
    return bcrypt.hashpw(_prehash_password(password), bcrypt.gensalt()).decode("utf-8")


def generate_internal_password() -> str:
    # Keep the generated placeholder short and stable for bcrypt-based schemes.
    return secrets.token_hex(16)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def send_otp_email(email: str, otp_code: str):
    if not OTP_EMAIL_SCRIPT.exists():
        logger.error("OTP email script not found at %s", OTP_EMAIL_SCRIPT)
        return False, "OTP email service is not configured on the server."

    try:
        result = subprocess.run(
            ["node", str(OTP_EMAIL_SCRIPT), email, otp_code, str(OTP_EXPIRY_MINUTES)],
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
            env=os.environ.copy(),
        )
        if result.returncode == 0:
            return True, None

        error_output = (result.stderr or result.stdout or "").strip()
        logger.error("Failed to send OTP email via Nodemailer: %s", error_output)
        return False, "Unable to send OTP email. Please verify the Gmail app password."
    except Exception as exc:
        logger.exception("Failed to send OTP email: %s", exc)
        return False, "Unable to send OTP email. Please try again."


def generate_otp():
    return str(random.randint(100000, 999999))


def get_authorized_admin_email(email: str):
    return select_one(
        "verified_admin_emails",
        filters={
            "email": f"eq.{normalize_email(email)}",
            "is_active": "eq.true",
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

    access_token = create_access_token(
        data={"sub": user["username"], "user_type": user["user_type"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": access_token, "token_type": "bearer"}


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
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)

    try:
        delete_rows(
            "otp_verifications",
            filters={
                "email": f"eq.{normalized_email}",
                "is_verified": "eq.false",
            },
            returning="minimal",
        )
        insert_row(
            "otp_verifications",
            {
                "email": normalized_email,
                "otp_code": otp_code,
                "is_verified": False,
                "expires_at": expires_at,
            },
        )
    except SupabaseAPIError as exc:
        raise_supabase_http(exc)

    email_sent, error_message = send_otp_email(normalized_email, otp_code)
    if email_sent:
        return {"message": "OTP sent successfully"}

    try:
        delete_rows(
            "otp_verifications",
            filters={
                "email": f"eq.{normalized_email}",
                "otp_code": f"eq.{otp_code}",
                "is_verified": "eq.false",
            },
            returning="minimal",
        )
    except SupabaseAPIError:
        logger.warning("Failed to clean up unsent OTP for %s", normalized_email)

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

    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        otp_record = select_one(
            "otp_verifications",
            filters={
                "email": f"eq.{normalized_email}",
                "otp_code": f"eq.{otp_verify.otp_code}",
                "is_verified": "eq.false",
                "expires_at": f"gt.{now_iso}",
            },
            order="id.desc",
        )
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
        "user": {
            "id": admin_user["id"],
            "username": admin_user["username"],
            "email": admin_user["email"],
            "user_type": admin_user["user_type"],
        },
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: CurrentUser):
    return current_user


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
