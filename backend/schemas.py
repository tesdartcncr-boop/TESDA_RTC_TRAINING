from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
import enum


class ProgramType(enum.Enum):
    INSTITUTION = "Institution"
    COMMUNITY_BASED = "Community-Based"
    OTHERS = "Others"

# User schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str
    user_type: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    user_type: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Trainer schemas
class TrainerBase(BaseModel):
    username: str
    trainer_name: Optional[str] = None
    qualifications: Optional[str] = None
    tm_number: Optional[str] = None
    tm_expiration: Optional[datetime] = None
    nttc_number: Optional[str] = None
    nttc_expiration: Optional[datetime] = None

class TrainerCreate(BaseModel):
    username: str
    password: str
    trainer_name: Optional[str] = None
    qualifications: Optional[str] = None
    tm_number: Optional[str] = None
    tm_expiration: Optional[datetime] = None
    nttc_number: Optional[str] = None
    nttc_expiration: Optional[datetime] = None

class TrainerUpdate(BaseModel):
    trainer_name: Optional[str] = None
    qualifications: Optional[str] = None
    tm_number: Optional[str] = None
    tm_expiration: Optional[datetime] = None
    nttc_number: Optional[str] = None
    nttc_expiration: Optional[datetime] = None

class TrainerResponse(BaseModel):
    id: int
    username: str
    trainer_name: str
    qualifications: Optional[str] = None
    tm_number: Optional[str] = None
    tm_expiration: Optional[datetime] = None
    nttc_number: Optional[str] = None
    nttc_expiration: Optional[datetime] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Authentication schemas
class LoginRequest(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# OTP schemas
class OTPRequest(BaseModel):
    email: EmailStr

class OTPVerify(BaseModel):
    email: EmailStr
    otp_code: str

# Program schemas
class ProgramBase(BaseModel):
    name: str
    description: Optional[str] = None
    type: ProgramType
    hours: int
    schedule: Optional[str] = "8 Hours/Day"
    days: Optional[int] = None

class ProgramCreate(BaseModel):
    name: str
    type: ProgramType
    description: Optional[str] = None
    hours: Optional[int] = None
    schedule: Optional[str] = "8 Hours/Day"
    days: Optional[int] = None

class ProgramUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[ProgramType] = None
    hours: Optional[int] = None
    schedule: Optional[str] = None
    days: Optional[int] = None
    is_active: Optional[bool] = None

class ProgramResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    type: str
    hours: int
    schedule: Optional[str] = "8 Hours/Day"
    days: Optional[int] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Notification schemas
class NotificationBase(BaseModel):
    title: str
    message: str

class NotificationCreate(NotificationBase):
    user_id: int

class NotificationResponse(BaseModel):
    id: int
    user_id: int
    title: str
    message: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True
