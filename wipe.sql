-- Wipe all Supabase contents for this project.
-- Run with care: this drops the tables and removes all data.

DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS otp_verifications CASCADE;
DROP TABLE IF EXISTS verified_admin_emails CASCADE;
DROP TABLE IF EXISTS programs CASCADE;
DROP TABLE IF EXISTS trainers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- If you have created any custom types or enums outside this script,
-- drop them here as well.
