-- Trainer Portal Database Schema
-- Run this in your Supabase SQL editor to create all tables

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150),
    sex VARCHAR(20) CHECK (sex IN ('Male', 'Female', 'Prefer not to say')),
    position VARCHAR(150),
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('admin', 'trainer', 'supervisor')),
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
    type VARCHAR(100) NOT NULL,
    validity DATE,
    hours INTEGER,
    schedule VARCHAR(20) DEFAULT '8 Hours/Day' CHECK (schedule IN ('8 Hours/Day', '4 Hours/Day')),
    days INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create program types catalog for dynamic program type management
CREATE TABLE IF NOT EXISTS program_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO program_types (name)
VALUES ('Institution-Based'), ('Community-Based'), ('Microcredential')
ON CONFLICT (name) DO NOTHING;

-- Create trainer_qualifications table for the programs a trainer is qualified to handle
CREATE TABLE IF NOT EXISTS trainer_qualifications (
    id SERIAL PRIMARY KEY,
    trainer_id INTEGER NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
    program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    nttc_number VARCHAR(50),
    nttc_expiration DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trainer_id, program_id)
);

-- Create trainer_programs table for persistent trainer-program teaching load assignments
CREATE TABLE IF NOT EXISTS trainer_programs (
    id SERIAL PRIMARY KEY,
    trainer_id INTEGER NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
    program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    hours_per_day INTEGER NOT NULL DEFAULT 8 CHECK (hours_per_day IN (4, 8)),
    approval_status VARCHAR(20) NOT NULL DEFAULT 'for approval' CHECK (approval_status IN ('for approval', 'approved', 'rejected')),
    approval_notes TEXT,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    nttc_number VARCHAR(50),
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
    status VARCHAR(20) DEFAULT NULL CHECK (status IS NULL OR status IN ('complete', 'absent', 'nat', 'suspended', 'leave', 'incomplete')),
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
    purpose VARCHAR(30) NOT NULL DEFAULT 'password_reset',
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
CREATE INDEX IF NOT EXISTS idx_program_types_name ON program_types(name);
CREATE INDEX IF NOT EXISTS idx_programs_created_by ON programs(created_by);
CREATE INDEX IF NOT EXISTS idx_trainer_qualifications_trainer_id ON trainer_qualifications(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_qualifications_program_id ON trainer_qualifications(program_id);
CREATE INDEX IF NOT EXISTS idx_trainer_programs_trainer_id ON trainer_programs(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_programs_program_id ON trainer_programs(program_id);
CREATE INDEX IF NOT EXISTS idx_schedules_trainer_id ON schedules(trainer_id);
CREATE INDEX IF NOT EXISTS idx_schedules_program_id ON schedules(program_id);
CREATE INDEX IF NOT EXISTS idx_schedules_trainer_program ON schedules(trainer_id, program_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_email ON otp_verifications(email);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_purpose ON otp_verifications(purpose);
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
ADD CONSTRAINT schedules_status_check CHECK (status IS NULL OR status IN ('complete', 'absent', 'nat', 'suspended', 'leave', 'incomplete'));

-- Add missing columns to trainer_programs table if they don't exist
ALTER TABLE IF EXISTS trainer_programs
ADD COLUMN IF NOT EXISTS schedule_date DATE;

ALTER TABLE IF EXISTS trainer_programs
ADD COLUMN IF NOT EXISTS hours_per_day INTEGER NOT NULL DEFAULT 8;

ALTER TABLE IF EXISTS trainer_programs
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'for approval';

ALTER TABLE IF EXISTS trainer_programs
ADD COLUMN IF NOT EXISTS approval_notes TEXT;

ALTER TABLE IF EXISTS trainer_programs
ADD COLUMN IF NOT EXISTS approved_by INTEGER;

ALTER TABLE IF EXISTS trainer_programs
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

ALTER TABLE IF EXISTS trainer_programs
ADD COLUMN IF NOT EXISTS nttc_number VARCHAR(50);

ALTER TABLE IF EXISTS trainer_programs
ADD COLUMN IF NOT EXISTS batch VARCHAR(50);

ALTER TABLE IF EXISTS trainer_programs
ALTER COLUMN assigned_by DROP NOT NULL;

ALTER TABLE IF EXISTS trainer_programs
DROP CONSTRAINT IF EXISTS trainer_programs_hours_per_day_check;

ALTER TABLE IF EXISTS trainer_programs
ADD CONSTRAINT trainer_programs_hours_per_day_check CHECK (hours_per_day IN (4, 8));

ALTER TABLE IF EXISTS trainer_programs
DROP CONSTRAINT IF EXISTS trainer_programs_approval_status_check;

ALTER TABLE IF EXISTS trainer_programs
ADD CONSTRAINT trainer_programs_approval_status_check CHECK (approval_status IN ('for approval', 'approved', 'rejected'));

-- Add missing columns to trainer_qualifications table if they don't exist
ALTER TABLE IF EXISTS trainer_qualifications
ADD COLUMN IF NOT EXISTS nttc_expiration DATE;

-- Add missing columns to users table if they don't exist
ALTER TABLE IF EXISTS users
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS users
ADD COLUMN IF NOT EXISTS full_name VARCHAR(150);

ALTER TABLE IF EXISTS users
ADD COLUMN IF NOT EXISTS sex VARCHAR(20);

ALTER TABLE IF EXISTS users
ADD COLUMN IF NOT EXISTS position VARCHAR(150);

ALTER TABLE IF EXISTS users
DROP CONSTRAINT IF EXISTS users_user_type_check;

ALTER TABLE IF EXISTS users
ADD CONSTRAINT users_user_type_check CHECK (user_type IN ('admin', 'trainer', 'supervisor'));

-- Add missing columns to trainers table if they don't exist
ALTER TABLE IF EXISTS trainers
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns to programs table if they don't exist
ALTER TABLE IF EXISTS programs
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS programs
ADD COLUMN IF NOT EXISTS validity DATE;

ALTER TABLE IF EXISTS programs
ALTER COLUMN type TYPE TEXT USING type::text;

ALTER TABLE IF EXISTS programs
ALTER COLUMN validity TYPE DATE USING CASE
    WHEN validity IS NULL THEN NULL
    WHEN validity::text ~ '^\d{4}-\d{2}-\d{2}$' THEN validity::date
    ELSE NULL
END;

ALTER TABLE IF EXISTS programs
ADD COLUMN IF NOT EXISTS recognition_number VARCHAR(100);

CREATE TABLE IF NOT EXISTS program_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO program_types (name)
VALUES ('Institution-Based'), ('Community-Based'), ('Microcredential')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE IF EXISTS programs
ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE IF EXISTS programs
DROP CONSTRAINT IF EXISTS programs_type_check; -- keep drop for safety; do not re-add static check so types can be dynamic

ALTER TABLE IF EXISTS otp_verifications
ADD COLUMN IF NOT EXISTS purpose VARCHAR(30) NOT NULL DEFAULT 'password_reset';

-- ============================================================================
-- Verification: Check schedules table structure
-- ============================================================================
-- Run this query to verify the schedules table has all required columns:
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns 
-- WHERE table_name = 'schedules' ORDER BY ordinal_position;

-- ============================================================================
-- MIGRATION: Add trainer name breakdown and recognition fields
-- ============================================================================
-- Add new columns to trainers table for name breakdown and CTPR/recognition number

ALTER TABLE IF EXISTS trainers
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);

ALTER TABLE IF EXISTS trainers
ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100);

ALTER TABLE IF EXISTS trainers
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

ALTER TABLE IF EXISTS trainers
ADD COLUMN IF NOT EXISTS extension VARCHAR(50);

ALTER TABLE IF EXISTS trainers
ADD COLUMN IF NOT EXISTS ctpr_recognition_number VARCHAR(100);

ALTER TABLE IF EXISTS trainers
ADD COLUMN IF NOT EXISTS trainer_type VARCHAR(50) CHECK (trainer_type IN ('Permanent', 'JO/Oncall'));

-- Create trainer qualifications table when migrating an existing setup
CREATE TABLE IF NOT EXISTS trainer_qualifications (
    id SERIAL PRIMARY KEY,
    trainer_id INTEGER NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
    program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    nttc_number VARCHAR(50),
    nttc_expiration DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trainer_id, program_id)
);

-- Messaging System Tables
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'issue' CHECK (message_type IN ('issue', 'inquiry', 'report', 'other')),
    status VARCHAR(20) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied')),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP WITH TIME ZONE,
    reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    is_deleted_by_sender BOOLEAN DEFAULT FALSE,
    is_deleted_by_recipient BOOLEAN DEFAULT FALSE
);

-- Message attachments table
CREATE TABLE IF NOT EXISTS message_attachments (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Message notifications table
CREATE TABLE IF NOT EXISTS message_notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, message_id)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_recipient_status ON messages(recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(recipient_id, status) WHERE status = 'unread';
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON message_notifications(user_id, is_read) WHERE is_read = FALSE;

-- Trainer activity updates for the admin Inbox Updates tab.
CREATE TABLE IF NOT EXISTS trainer_activity_updates (
    id SERIAL PRIMARY KEY,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    trainer_id INTEGER REFERENCES trainers(id) ON DELETE SET NULL,
    program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL,
    schedule_id INTEGER REFERENCES schedules(id) ON DELETE SET NULL,
    message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    action_type VARCHAR(40) NOT NULL CHECK (action_type IN ('schedule_status', 'message_sent')),
    action_label VARCHAR(120) NOT NULL,
    details TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trainer_activity_updates_created ON trainer_activity_updates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trainer_activity_updates_actor ON trainer_activity_updates(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_trainer_activity_updates_trainer ON trainer_activity_updates(trainer_id);

-- Function to get unread message count for a user
CREATE OR REPLACE FUNCTION get_unread_message_count(p_user_id INTEGER)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM messages
        WHERE recipient_id = p_user_id
        AND status = 'unread'
        AND is_deleted_by_recipient = FALSE
    );
END;
$$ LANGUAGE plpgsql;

-- Function to create message notification
CREATE OR REPLACE FUNCTION create_message_notification(p_message_id INTEGER)
RETURNS VOID AS $$
BEGIN
    INSERT INTO message_notifications (user_id, message_id)
    SELECT recipient_id, p_message_id
    FROM messages
    WHERE id = p_message_id
    ON CONFLICT (user_id, message_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically create notifications for new messages
CREATE OR REPLACE FUNCTION trigger_message_notification()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM create_message_notification(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_create_message_notification ON messages;
CREATE TRIGGER trigger_create_message_notification
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION trigger_message_notification();

-- Ensure legacy databases do not keep NULL delete flags that break inbox filters.
ALTER TABLE IF EXISTS messages
    ALTER COLUMN is_deleted_by_sender SET DEFAULT FALSE,
    ALTER COLUMN is_deleted_by_recipient SET DEFAULT FALSE;

UPDATE messages
SET is_deleted_by_sender = COALESCE(is_deleted_by_sender, FALSE),
    is_deleted_by_recipient = COALESCE(is_deleted_by_recipient, FALSE)
WHERE is_deleted_by_sender IS NULL OR is_deleted_by_recipient IS NULL;

ALTER TABLE IF EXISTS messages
    ALTER COLUMN is_deleted_by_sender SET NOT NULL,
    ALTER COLUMN is_deleted_by_recipient SET NOT NULL;

-- ============================================================================
-- MIGRATION: Normalize foreign keys for safe account deletion
-- ============================================================================
-- `CREATE TABLE IF NOT EXISTS` does not repair foreign keys on an existing
-- database. Run this section on older databases so user deletion works with
-- messaging history and management audit records.

ALTER TABLE IF EXISTS programs
    DROP CONSTRAINT IF EXISTS programs_created_by_fkey;

ALTER TABLE IF EXISTS programs
    ADD CONSTRAINT programs_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS trainer_programs
    DROP CONSTRAINT IF EXISTS trainer_programs_assigned_by_fkey;

ALTER TABLE IF EXISTS trainer_programs
    ADD CONSTRAINT trainer_programs_assigned_by_fkey
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS trainer_programs
    DROP CONSTRAINT IF EXISTS trainer_programs_approved_by_fkey;

ALTER TABLE IF EXISTS trainer_programs
    ADD CONSTRAINT trainer_programs_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS messages
    DROP CONSTRAINT IF EXISTS messages_sender_id_fkey,
    DROP CONSTRAINT IF EXISTS messages_recipient_id_fkey,
    DROP CONSTRAINT IF EXISTS messages_reply_to_id_fkey;

ALTER TABLE IF EXISTS messages
    ADD CONSTRAINT messages_sender_id_fkey
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    ADD CONSTRAINT messages_recipient_id_fkey
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
    ADD CONSTRAINT messages_reply_to_id_fkey
        FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS message_attachments
    DROP CONSTRAINT IF EXISTS message_attachments_message_id_fkey;

ALTER TABLE IF EXISTS message_attachments
    ADD CONSTRAINT message_attachments_message_id_fkey
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS message_notifications
    DROP CONSTRAINT IF EXISTS message_notifications_user_id_fkey,
    DROP CONSTRAINT IF EXISTS message_notifications_message_id_fkey;

ALTER TABLE IF EXISTS message_notifications
    ADD CONSTRAINT message_notifications_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    ADD CONSTRAINT message_notifications_message_id_fkey
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE;
