-- =========================================================================
-- 007_fix_hrms_rls_policies.sql
-- Fixes RLS policies and converts legacy enum department to text
-- so managers can update team roles, departments, status, and add new people.
-- =========================================================================

-- 0. Convert department column on profiles to text so it accepts any department
alter table public.profiles alter column department drop default;
alter table public.profiles alter column department type text using department::text;
alter table public.profiles alter column department set default 'Tech';

-- Also add values to enum if referenced elsewhere
do $$
begin
  if exists (select 1 from pg_type where typname = 'company_department') then
    begin
      alter type company_department add value if not exists 'Tech';
    exception when others then null;
    end;
    begin
      alter type company_department add value if not exists 'Growth';
    exception when others then null;
    end;
    begin
      alter type company_department add value if not exists 'tech';
    exception when others then null;
    end;
    begin
      alter type company_department add value if not exists 'growth';
    exception when others then null;
    end;
  end if;
end $$;

-- 1. Allow profiles to have standalone UUIDs and be inserted/updated by authenticated managers
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles drop constraint if exists profiles_id_fkey;

drop policy if exists "auth_update_profiles" on public.profiles;
create policy "auth_update_profiles" on public.profiles
  for update to authenticated using (true) with check (true);

drop policy if exists "auth_insert_profiles" on public.profiles;
create policy "auth_insert_profiles" on public.profiles
  for insert to authenticated with check (true);

drop policy if exists "auth_select_profiles" on public.profiles;
create policy "auth_select_profiles" on public.profiles
  for select to authenticated using (true);

-- 2. Full access on junction and dimension tables
alter table public.hrms_roles enable row level security;
alter table public.departments enable row level security;
alter table public.profile_departments enable row level security;

drop policy if exists "auth_select_roles" on public.hrms_roles;
drop policy if exists "auth_all_roles" on public.hrms_roles;
create policy "auth_all_roles" on public.hrms_roles
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_select_departments" on public.departments;
drop policy if exists "auth_all_departments" on public.departments;
create policy "auth_all_departments" on public.departments
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_select_profile_departments" on public.profile_departments;
drop policy if exists "auth_all_profile_departments" on public.profile_departments;
create policy "auth_all_profile_departments" on public.profile_departments
  for all to authenticated using (true) with check (true);

-- 3. Full access on HRMS operational tables
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'leave_balances',
    'leave_requests',
    'reimbursement_claims',
    'payslips',
    'insurance_cover',
    'company_policies',
    'company_holidays',
    'talent_of_the_month',
    'talent_nominations'
  ])
  loop
    if exists (select from pg_tables where schemaname = 'public' and tablename = tbl) then
      execute format('alter table public.%I enable row level security;', tbl);
      execute format('drop policy if exists "auth_all_%I" on public.%I;', tbl, tbl);
      execute format('drop policy if exists "auth_select_%I" on public.%I;', tbl, tbl);
      execute format('create policy "auth_all_%I" on public.%I for all to authenticated using (true) with check (true);', tbl, tbl);
    end if;
  end loop;
end $$;

-- 4. Convert leave_type on leave_requests to text so it accepts 'Monthly', 'Birthday', etc.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leave_requests' and column_name = 'leave_type') then
    alter table public.leave_requests alter column leave_type type text using leave_type::text;
  end if;
end $$;

-- 5. Ensure dob column on profiles for birthday leave
alter table public.profiles add column if not exists dob date;

-- 6. Ensure company_holidays table exists
create table if not exists public.company_holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  holiday_date date not null,
  year integer not null,
  created_at timestamp with time zone default now()
);
alter table public.company_holidays enable row level security;
drop policy if exists "auth_all_company_holidays" on public.company_holidays;
create policy "auth_all_company_holidays" on public.company_holidays for all to authenticated using (true) with check (true);

-- 7. Add must_change_password column to profiles
alter table public.profiles add column if not exists must_change_password boolean default false;
