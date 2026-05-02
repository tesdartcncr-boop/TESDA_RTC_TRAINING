-- Fix schedules table - Add missing columns if they don't exist
-- Run this in your Supabase SQL Editor

-- First, let's check the current structure
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'schedules' ORDER BY ordinal_position;

-- If the schedules table is missing the status column, we need to alter it
-- This will add all necessary columns:

ALTER TABLE IF EXISTS public.schedules 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT NULL CHECK (status IS NULL OR status IN ('complete', 'absent', 'suspended', 'leave'));

ALTER TABLE IF EXISTS public.schedules 
ADD COLUMN IF NOT EXISTS schedule_date DATE;

ALTER TABLE IF EXISTS public.schedules 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Verify the table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'schedules' 
ORDER BY ordinal_position;
