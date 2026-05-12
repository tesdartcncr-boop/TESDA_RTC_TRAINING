-- Messaging System Schema Migration
-- Run this script to create the messaging tables

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

-- Grant permissions
GRANT ALL ON messages TO authenticated;
GRANT ALL ON message_attachments TO authenticated;
GRANT ALL ON message_notifications TO authenticated;
GRANT ALL ON SEQUENCE messages_id_seq TO authenticated;
GRANT ALL ON SEQUENCE message_attachments_id_seq TO authenticated;
GRANT ALL ON SEQUENCE message_notifications_id_seq TO authenticated;

-- Enable RLS (Row Level Security)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for messages
CREATE POLICY "Users can view messages sent to them" ON messages
    FOR SELECT USING (
        auth.uid() = recipient_id OR 
        auth.uid() = sender_id
    );

CREATE POLICY "Users can insert messages they send" ON messages
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update messages they receive" ON messages
    FOR UPDATE USING (auth.uid() = recipient_id);

CREATE POLICY "Users can delete messages they sent or received" ON messages
    FOR DELETE USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- RLS Policies for message_attachments
CREATE POLICY "Users can view attachments for their messages" ON message_attachments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM messages 
            WHERE messages.id = message_attachments.message_id
            AND (auth.uid() = messages.recipient_id OR auth.uid() = messages.sender_id)
        )
    );

-- RLS Policies for message_notifications
CREATE POLICY "Users can view their own notifications" ON message_notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications" ON message_notifications
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own notifications" ON message_notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- Sample data for testing (optional)
INSERT INTO messages (sender_id, recipient_id, subject, content, message_type, priority)
SELECT 
    u1.id, 
    u2.id, 
    'Test Message from Trainer', 
    'This is a test message from a trainer to an administrator.', 
    'issue', 
    'normal'
FROM users u1, users u2
WHERE u1.username = 'trainer1' 
AND u2.user_type IN ('admin', 'supervisor')
LIMIT 1;

COMMIT;
