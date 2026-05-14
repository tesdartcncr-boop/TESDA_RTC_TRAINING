-- Messaging System Schema Migration
-- Run this script to create the messaging tables
-- NOTE: RLS policies removed - authorization is handled by the FastAPI backend

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS message_notifications CASCADE;
DROP TABLE IF EXISTS message_attachments CASCADE;
DROP TABLE IF EXISTS messages CASCADE;

-- Messages table
CREATE TABLE messages (
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
CREATE TABLE message_attachments (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Message notifications table
CREATE TABLE message_notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, message_id)
);

-- Indexes for better performance
CREATE INDEX idx_messages_recipient_status ON messages(recipient_id, status);
CREATE INDEX idx_messages_sender_created ON messages(sender_id, created_at DESC);
CREATE INDEX idx_messages_unread ON messages(recipient_id, status) WHERE status = 'unread';
CREATE INDEX idx_notifications_user_unread ON message_notifications(user_id, is_read) WHERE is_read = FALSE;

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

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_create_message_notification ON messages;

-- Create trigger
CREATE TRIGGER trigger_create_message_notification
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION trigger_message_notification();

-- Normalize deletion flags for existing rows so inbox filters don't hide valid replies.
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

-- Note: RLS (Row Level Security) is NOT enabled here
-- Authorization is enforced by the FastAPI backend using get_current_user dependency
-- This allows the schema to work with both local PostgreSQL and Supabase

-- Sample data for testing (optional)
-- Uncomment the line below if you want to create a test message
-- INSERT INTO messages (sender_id, recipient_id, subject, content, message_type, priority)
-- SELECT 
--     u1.id, 
--     u2.id, 
--     'Test Message from Trainer', 
--     'This is a test message from a trainer to an administrator.', 
--     'issue', 
--     'normal'
-- FROM users u1, users u2
-- WHERE u1.username = 'trainer1' 
-- AND u2.user_type IN ('admin', 'supervisor')
-- LIMIT 1;
