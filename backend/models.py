from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, Enum
from sqlalchemy.sql import func
from database import Base
import enum

class UserType(enum.Enum):
    ADMIN = "admin"
    TRAINER = "trainer"
    SUPERVISOR = "supervisor"

class ProgramType(enum.Enum):
    INSTITUTION = "Institution-Based"
    COMMUNITY_BASED = "Community-Based"
    MICROCREDENTIAL = "Microcredential"

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(150))
    user_type = Column(Enum(UserType), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Trainer(Base):
    __tablename__ = "trainers"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)  # Foreign key to users table
    username = Column(String(50), unique=True, index=True, nullable=False)
    qualifications = Column(Text)
    trainer_name = Column(String(100), nullable=False)
    first_name = Column(String(100))
    middle_name = Column(String(100))
    last_name = Column(String(100))
    extension = Column(String(50))
    trainer_type = Column(String(50))  # Permanent, JO/Oncall
    tm_number = Column(String(50))
    tm_expiration = Column(DateTime(timezone=True))
    nttc_number = Column(String(50))
    nttc_expiration = Column(DateTime(timezone=True))
    ctpr_recognition_number = Column(String(100))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Program(Base):
    __tablename__ = "programs"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    type = Column(Enum(ProgramType), nullable=False)
    validity = Column(String(100))
    hours = Column(Integer, nullable=False)
    schedule = Column(String(20), default="8 Hours/Day")
    days = Column(Integer)
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, nullable=False)  # Admin user ID
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class TrainerProgram(Base):
    __tablename__ = "trainer_programs"
    
    id = Column(Integer, primary_key=True, index=True)
    trainer_id = Column(Integer, nullable=False, index=True)
    program_id = Column(Integer, nullable=False, index=True)
    assigned_by = Column(Integer, nullable=False)
    hours_per_day = Column(Integer, nullable=False, default=8)
    approval_status = Column(String(20), nullable=False, default="for approval")
    approval_notes = Column(Text)
    approved_by = Column(Integer)
    approved_at = Column(DateTime(timezone=True))
    nttc_number = Column(String(50))
    schedule_date = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class TrainerQualification(Base):
    __tablename__ = "trainer_qualifications"

    id = Column(Integer, primary_key=True, index=True)
    trainer_id = Column(Integer, nullable=False, index=True)
    program_id = Column(Integer, nullable=False, index=True)
    nttc_number = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class OTPVerification(Base):
    __tablename__ = "otp_verifications"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), nullable=False)
    purpose = Column(String(30), nullable=False, default="password_reset")
    otp_code = Column(String(6), nullable=False)
    is_verified = Column(Boolean, default=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Notification(Base):
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class VerifiedAdminEmail(Base):
    __tablename__ = "verified_admin_emails"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
