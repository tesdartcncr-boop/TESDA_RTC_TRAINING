import enum
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

DEFAULT_PROGRAM_SCHEDULE = "8 Hours/Day"
DEFAULT_APPROVAL_STATUS = "for approval"


class ProgramType(enum.Enum):
    INSTITUTION_BASED = "Institution-Based"
    COMMUNITY_BASED = "Community-Based"
    MICROCREDENTIAL = "Microcredential"


class AccountRole(enum.Enum):
    ADMIN = "admin"
    TRAINER = "trainer"
    SUPERVISOR = "supervisor"


class ApprovalStatus(enum.Enum):
    FOR_APPROVAL = "for approval"
    APPROVED = "approved"
    REJECTED = "rejected"


class ScheduleStatus(enum.Enum):
    COMPLETE = "complete"
    ABSENT = "absent"
    NAT = "nat"
    LEAVE = "leave"
    SUSPENDED = "suspended"
    INCOMPLETE = "incomplete"


class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    sex: Optional[str] = None
    position: Optional[str] = None


class UserCreate(UserBase):
    password: str
    user_type: AccountRole


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str] = None
    sex: Optional[str] = None
    position: Optional[str] = None
    user_type: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)
    remember_me: bool = False


class Token(BaseModel):
    access_token: str
    token_type: str
    user: Optional[UserResponse] = None


class TokenData(BaseModel):
    username: Optional[str] = None


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    email: EmailStr
    otp_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(min_length=8, max_length=128)


class OTPRequest(BaseModel):
    email: EmailStr


class OTPVerify(BaseModel):
    email: EmailStr
    otp_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class TrainerQualificationInput(BaseModel):
    program_id: int
    nttc_number: Optional[str] = None
    nttc_expiration: Optional[date] = None


class TrainerQualificationResponse(BaseModel):
    id: int
    trainer_id: int
    program_id: int
    nttc_number: Optional[str] = None
    nttc_expiration: Optional[date] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TrainerCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    trainer_name: Optional[str] = None
    sex: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    extension: Optional[str] = None
    trainer_type: Optional[str] = None
    tm_number: Optional[str] = None
    tm_expiration: Optional[datetime] = None
    nttc_number: Optional[str] = None
    nttc_expiration: Optional[datetime] = None
    ctpr_recognition_number: Optional[str] = None
    qualifications: list[TrainerQualificationInput] = Field(default_factory=list)


class TrainerUpdate(BaseModel):
    email: Optional[EmailStr] = None
    trainer_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    extension: Optional[str] = None
    trainer_type: Optional[str] = None
    tm_number: Optional[str] = None
    tm_expiration: Optional[datetime] = None
    nttc_number: Optional[str] = None
    nttc_expiration: Optional[datetime] = None
    ctpr_recognition_number: Optional[str] = None
    sex: Optional[str] = None


class TrainerSelfUpdate(BaseModel):
    trainer_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    extension: Optional[str] = None
    trainer_type: Optional[str] = None
    tm_number: Optional[str] = None
    tm_expiration: Optional[datetime] = None
    nttc_number: Optional[str] = None
    nttc_expiration: Optional[datetime] = None
    ctpr_recognition_number: Optional[str] = None
    sex: Optional[str] = None


class TrainerResponse(BaseModel):
    id: int
    user_id: int
    username: str
    trainer_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    extension: Optional[str] = None
    trainer_type: Optional[str] = None
    tm_number: Optional[str] = None
    tm_expiration: Optional[datetime] = None
    nttc_number: Optional[str] = None
    nttc_expiration: Optional[datetime] = None
    ctpr_recognition_number: Optional[str] = None
    is_active: bool
    created_at: datetime
    sex: Optional[str] = None

    class Config:
        from_attributes = True


class ProgramCreate(BaseModel):
    name: str
    type: str
    description: Optional[str] = None
    validity: Optional[date] = None
    hours: Optional[int] = None
    schedule: Optional[str] = DEFAULT_PROGRAM_SCHEDULE
    days: Optional[int] = None
    recognition_number: Optional[str] = None


class ProgramUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    validity: Optional[date] = None
    hours: Optional[int] = None
    schedule: Optional[str] = None
    days: Optional[int] = None
    is_active: Optional[bool] = None
    recognition_number: Optional[str] = None


class ProgramResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    type: str
    validity: Optional[date] = None
    hours: int
    schedule: Optional[str] = DEFAULT_PROGRAM_SCHEDULE
    days: Optional[int] = None
    is_active: bool
    recognition_number: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TeachingLoadCreate(BaseModel):
    program_id: int
    hours_per_day: int = Field(default=8)
    nttc_number: Optional[str] = None
    schedule_date: Optional[date] = None
    batch: Optional[str] = None
    use_digital_signature: bool = False
    allowed_days: Optional[list[int]] = None


class TeachingLoadApprovalUpdate(BaseModel):
    approval_status: ApprovalStatus
    approval_notes: Optional[str] = None


class TeachingLoadResponse(BaseModel):
    id: int
    trainer_id: int
    program_id: int
    assigned_by: int
    hours_per_day: int
    approval_status: str
    approval_notes: Optional[str] = None
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    nttc_number: Optional[str] = None
    schedule_date: Optional[date] = None
    batch: Optional[str] = None
    assigned_by_signature_enabled: bool = False
    allowed_days: Optional[list[int]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ScheduleUpdate(BaseModel):
    hours_per_day: int
    status: Optional[ScheduleStatus] = None
    schedule_date: Optional[datetime] = None
    notes: Optional[str] = None


class ScheduleHoursUpdate(BaseModel):
    hours_per_day: int


class NotificationCreate(BaseModel):
    user_id: int
    title: str
    message: str


class NotificationResponse(BaseModel):
    id: int
    user_id: int
    title: str
    message: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AuthorizedEmailCreate(BaseModel):
    email: EmailStr


class AuthorizedEmailResponse(BaseModel):
    id: int
    email: EmailStr
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AccountCreate(BaseModel):
    username: str
    email: EmailStr
    full_name: str
    password: str
    user_type: AccountRole
    sex: Optional[str] = None
    position: Optional[str] = None


class AccountUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
    sex: Optional[str] = None
    position: Optional[str] = None


class ProgramTypeCreate(BaseModel):
    name: str


class ProgramTypeResponse(BaseModel):
    id: int
    name: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    recipient_id: int
    subject: str
    content: str
    message_type: str = "issue"
    priority: str = "normal"
    reply_to_id: Optional[int] = None


class MessageUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None


class MessageResponse(BaseModel):
    id: int
    sender_id: int
    recipient_id: int
    subject: str
    content: str
    message_type: str
    status: str
    priority: str
    created_at: datetime
    read_at: Optional[datetime] = None
    reply_to_id: Optional[int] = None
    is_deleted_by_sender: bool = False
    is_deleted_by_recipient: bool = False

    class Config:
        from_attributes = True


class MessageAttachmentCreate(BaseModel):
    filename: str
    file_path: str
    file_size: Optional[int] = None
    mime_type: Optional[str] = None


class MessageAttachmentResponse(BaseModel):
    id: int
    message_id: int
    filename: str
    file_path: str
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AdminUserResponse(BaseModel):
    id: int
    full_name: Optional[str] = None
    user_type: str
    email: str

    class Config:
        from_attributes = True
