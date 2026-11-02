-- Migration 013: Add website column to leads, fractional_leaders, and training_partners
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.fractional_leaders ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.training_partners ADD COLUMN IF NOT EXISTS website text;

