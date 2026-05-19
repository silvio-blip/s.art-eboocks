-- Add saved_address column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS saved_address JSONB DEFAULT '{}'::jsonb;
