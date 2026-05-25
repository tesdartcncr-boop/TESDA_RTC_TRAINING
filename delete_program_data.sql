-- Remove program-related data while keeping the schema intact.
-- This clears schedules first, then teaching loads, then program records.

BEGIN;

DELETE FROM schedules;
DELETE FROM trainer_programs;
DELETE FROM trainer_qualifications;
DELETE FROM programs;

COMMIT;