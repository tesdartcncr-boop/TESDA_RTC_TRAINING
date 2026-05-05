-- Trainer Portal Database Schema
-- Run this in your Supabase SQL editor to create all tables

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('admin', 'trainer')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trainers table
CREATE TABLE IF NOT EXISTS trainers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(50) UNIQUE NOT NULL,
    qualifications TEXT,
    trainer_name VARCHAR(100),
    tm_number VARCHAR(50),
    tm_expiration TIMESTAMP,
    nttc_number VARCHAR(50),
    nttc_expiration TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create programs table
CREATE TABLE IF NOT EXISTS programs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL CHECK (type IN ('Institution', 'Community-Based', 'Others')),
    hours INTEGER,
    schedule VARCHAR(20) DEFAULT '8 Hours/Day' CHECK (schedule IN ('8 Hours/Day', '4 Hours/Day')),
    days INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trainer_programs table for persistent trainer-program assignments
CREATE TABLE IF NOT EXISTS trainer_programs (
    id SERIAL PRIMARY KEY,
    trainer_id INTEGER NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
    program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    assigned_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    schedule_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trainer_id, program_id)
);

-- Create schedules table for tracking daily schedule entries
-- Day 0 is reserved internally for assignment-level schedule settings metadata.
CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    trainer_id INTEGER NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
    program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    hours_per_day INTEGER NOT NULL CHECK (hours_per_day IN (4, 8)),
    status VARCHAR(20) DEFAULT NULL CHECK (status IS NULL OR status IN ('complete', 'absent', 'suspended', 'leave')),
    schedule_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trainer_id, program_id, day_number)
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create otp_verifications table
CREATE TABLE IF NOT EXISTS otp_verifications (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    is_verified BOOLEAN DEFAULT false,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create verified_admin_emails table for admin OTP login
CREATE TABLE IF NOT EXISTS verified_admin_emails (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_trainers_username ON trainers(username);
CREATE INDEX IF NOT EXISTS idx_trainers_user_id ON trainers(user_id);
CREATE INDEX IF NOT EXISTS idx_programs_type ON programs(type);
CREATE INDEX IF NOT EXISTS idx_programs_created_by ON programs(created_by);
CREATE INDEX IF NOT EXISTS idx_trainer_programs_trainer_id ON trainer_programs(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_programs_program_id ON trainer_programs(program_id);
CREATE INDEX IF NOT EXISTS idx_schedules_trainer_id ON schedules(trainer_id);
CREATE INDEX IF NOT EXISTS idx_schedules_program_id ON schedules(program_id);
CREATE INDEX IF NOT EXISTS idx_schedules_trainer_program ON schedules(trainer_id, program_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_email ON otp_verifications(email);
CREATE INDEX IF NOT EXISTS idx_verified_admin_emails_email ON verified_admin_emails(email);

-- ============================================================================
-- MIGRATION: Add missing columns to existing tables (fixes for existing setups)
-- ============================================================================
-- This section ensures that if you run this schema on an existing database,
-- any missing columns will be added automatically

-- Add missing columns to schedules table if they don't exist
ALTER TABLE IF EXISTS schedules 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT NULL;

ALTER TABLE IF EXISTS schedules 
ADD COLUMN IF NOT EXISTS schedule_date DATE;

ALTER TABLE IF EXISTS schedules 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add status constraint if it doesn't exist
ALTER TABLE IF EXISTS schedules 
DROP CONSTRAINT IF EXISTS schedules_status_check;

ALTER TABLE IF EXISTS schedules 
ADD CONSTRAINT schedules_status_check CHECK (status IS NULL OR status IN ('complete', 'absent', 'suspended', 'leave'));

-- Add missing columns to trainer_programs table if they don't exist
ALTER TABLE IF EXISTS trainer_programs
ADD COLUMN IF NOT EXISTS schedule_date DATE;

-- Add missing columns to users table if they don't exist
ALTER TABLE IF EXISTS users
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns to trainers table if they don't exist
ALTER TABLE IF EXISTS trainers
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns to programs table if they don't exist
ALTER TABLE IF EXISTS programs
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- ============================================================================
-- Verification: Check schedules table structure
-- ============================================================================
-- Run this query to verify the schedules table has all required columns:
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns 
-- WHERE table_name = 'schedules' ORDER BY ordinal_position;
