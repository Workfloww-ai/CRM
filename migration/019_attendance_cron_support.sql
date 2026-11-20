-- =========================================================================
-- 019_attendance_cron_support.sql
-- Enables Cloud Run / WhatsApp cron jobs to read employee contacts
-- even when running with the Supabase anon key without RLS permission errors.
-- =========================================================================

-- 1. Allow anon role to read profiles (id, full_name, phone) for attendance notifications
drop policy if exists "anon_read_profiles" on public.profiles;
create policy "anon_read_profiles" on public.profiles for select to anon using (true);

-- 2. Security Definer RPC function to fetch active employees for check-in / check-out crons
create or replace function get_active_employees_for_attendance()
returns table(id uuid, full_name text, phone text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select p.id, p.full_name, p.phone
  from public.profiles p
  where coalesce(p.is_active, true) = true 
    and p.phone is not null 
    and length(trim(p.phone)) > 0;
end;
$$;

grant execute on function get_active_employees_for_attendance() to anon, authenticated, service_role;
