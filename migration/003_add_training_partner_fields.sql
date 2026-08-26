-- Add missing fields to training_partners, fractional_leaders, and investors tables to match the UI

-- 1. Training Partners
ALTER TABLE training_partners
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS phone_2 text,
ADD COLUMN IF NOT EXISTS industry text,
ADD COLUMN IF NOT EXISTS function text,
ADD COLUMN IF NOT EXISTS linkedin text,
ADD COLUMN IF NOT EXISTS location text,
ADD COLUMN IF NOT EXISTS revenue numeric,
ADD COLUMN IF NOT EXISTS currency text default 'INR';

-- 2. Fractional Leaders
ALTER TABLE fractional_leaders
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS phone_2 text,
ADD COLUMN IF NOT EXISTS industry text,
ADD COLUMN IF NOT EXISTS function text,
ADD COLUMN IF NOT EXISTS linkedin text,
ADD COLUMN IF NOT EXISTS location text,
ADD COLUMN IF NOT EXISTS revenue numeric,
ADD COLUMN IF NOT EXISTS currency text default 'INR';

-- 3. Investors
ALTER TABLE investors
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS phone_2 text,
ADD COLUMN IF NOT EXISTS industry text,
ADD COLUMN IF NOT EXISTS function text,
ADD COLUMN IF NOT EXISTS linkedin text,
ADD COLUMN IF NOT EXISTS location text,
ADD COLUMN IF NOT EXISTS revenue numeric,
ADD COLUMN IF NOT EXISTS currency text default 'INR';
