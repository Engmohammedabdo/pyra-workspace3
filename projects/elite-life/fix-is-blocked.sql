-- Elite Life: Add is_blocked column to patients
-- Run this in Supabase SQL Editor

-- Add is_blocked column
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_patients_is_blocked ON patients(is_blocked) WHERE is_blocked = true;

-- Comment
COMMENT ON COLUMN patients.is_blocked IS 'Block patient from receiving messages (spam/abusive)';

-- Verify
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'patients' AND column_name = 'is_blocked';
