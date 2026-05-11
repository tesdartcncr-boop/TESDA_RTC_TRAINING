-- Seed admin and trainer accounts for this schema
-- Run this in Supabase SQL editor. Uses pgcrypto to generate bcrypt hashes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Admin account
INSERT INTO users (username, email, password_hash, full_name, user_type, is_active)
VALUES (
  'admin',
  'admin@rtc.local',
  crypt('AdminPass123!', gen_salt('bf')),
  'Admin User',
  'admin',
  true
)
ON CONFLICT (username) DO UPDATE
  SET email = EXCLUDED.email,
      password_hash = EXCLUDED.password_hash,
      full_name = EXCLUDED.full_name,
      is_active = EXCLUDED.is_active;

-- Trainer (user) account
INSERT INTO users (username, email, password_hash, full_name, user_type, is_active)
VALUES (
  'trainer1',
  'trainer1@rtc.local',
  crypt('UserPass123!', gen_salt('bf')),
  'Trainer One',
  'trainer',
  true
)
ON CONFLICT (username) DO UPDATE
  SET email = EXCLUDED.email,
      password_hash = EXCLUDED.password_hash,
      full_name = EXCLUDED.full_name,
      is_active = EXCLUDED.is_active;

-- Ensure a corresponding trainers row exists for the trainer account
INSERT INTO trainers (user_id, username, trainer_name, is_active, created_at, updated_at)
SELECT id, username, 'Trainer One', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM users WHERE username = 'trainer1'
ON CONFLICT (username) DO NOTHING;
