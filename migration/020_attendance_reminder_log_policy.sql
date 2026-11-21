-- =========================================================================
-- 020_attendance_reminder_log_policy.sql
-- Enables Cloud Run / cron endpoints to claim and release attendance reminders
-- without Row Level Security (RLS) blocking the anon service key.
-- =========================================================================

-- 1. Ensure table exists with correct schema
create table if not exists public.attendance_reminder_log (
  id uuid primary key default gen_random_uuid(),
  reminder_date text not null,
  kind text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (reminder_date, kind, user_id)
);

-- 2. Enable RLS
alter table public.attendance_reminder_log enable row level security;

-- 3. Policy: allow anon, authenticated, and service_role full access
drop policy if exists "allow_all_attendance_reminder_log" on public.attendance_reminder_log;
create policy "allow_all_attendance_reminder_log" on public.attendance_reminder_log
  for all to anon, authenticated, service_role
  using (true) with check (true);

-- 4. Grant permissions
grant all on public.attendance_reminder_log to anon, authenticated, service_role;

-- 5. Optional: Update default shift end time to 19:00 (7:00 PM) if office closes at 7 PM
-- Uncomment the line below if office shift ends at 7:00 PM:
-- update public.attendance_shifts set end_time = '19:00:00' where is_default = true;
