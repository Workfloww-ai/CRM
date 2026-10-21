-- =========================================================================
-- 006_roles_and_departments_tables.sql
-- Two roles: 'manager' and 'employee'
-- Two departments: 'Growth' and 'Tech' (with support for multiple departments per employee)
-- Foreign keys linked to profiles table
-- =========================================================================

-- 1. Create hrms_roles table (two roles only)
create table if not exists public.hrms_roles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null check (name in ('manager', 'employee')),
  created_at timestamptz default now()
);

insert into public.hrms_roles (name)
values ('manager'), ('employee')
on conflict (name) do nothing;

-- 2. Create departments table (two departments only: Growth and Tech)
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text unique not null check (name in ('Growth', 'Tech')),
  created_at timestamptz default now()
);

insert into public.departments (name)
values ('Growth'), ('Tech')
on conflict (name) do nothing;

-- 3. Add foreign key columns to profiles
alter table public.profiles
  add column if not exists role_id uuid references public.hrms_roles(id),
  add column if not exists primary_department_id uuid references public.departments(id);

-- 4. Create junction table for multiple departments per employee
create table if not exists public.profile_departments (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (profile_id, department_id)
);

-- Fast lookup indexes
create index if not exists idx_profiles_role_id on public.profiles(role_id);
create index if not exists idx_profiles_primary_dept on public.profiles(primary_department_id);
create index if not exists idx_profile_departments_dept on public.profile_departments(department_id);

-- 5. Backfill existing roles in profiles (manager if role_level >= 1 or Shilpa/Manish, else employee)
update public.profiles
set role_id = (select id from public.hrms_roles where name = 'manager')
where role_level >= 1 
   or email ilike '%shilpa%' 
   or email ilike '%manish%'
   or hrms_role in ('admin', 'manager');

update public.profiles
set role_id = (select id from public.hrms_roles where name = 'employee')
where role_id is null;

-- 6. Backfill primary_department_id (Growth if can_access_crm or growth email/name, else Tech)
update public.profiles
set primary_department_id = (
  select id from public.departments 
  where name = case 
    when can_access_crm = true or department::text ilike '%growth%' or email ilike '%paridhi%' or email ilike '%monalika%' then 'Growth'
    else 'Tech'
  end
)
where primary_department_id is null;

-- 7. Backfill profile_departments junction table
-- Growth assignments
insert into public.profile_departments (profile_id, department_id)
select p.id, d.id
from public.profiles p
join public.departments d on d.name = 'Growth'
where p.can_access_crm = true 
   or p.department::text ilike '%growth%'
   or p.secondary_department ilike '%growth%'
   or p.email ilike '%shilpa%'
   or p.email ilike '%paridhi%'
   or p.email ilike '%monalika%'
on conflict do nothing;

-- Tech assignments (Tech for Shilpa, Manish, and tech team)
insert into public.profile_departments (profile_id, department_id)
select p.id, d.id
from public.profiles p
join public.departments d on d.name = 'Tech'
where p.department::text ilike '%tech%'
   or p.department::text ilike '%eng%'
   or p.secondary_department ilike '%tech%'
   or p.email ilike '%shilpa%'
   or p.email ilike '%manish%'
on conflict do nothing;

-- Ensure every profile has at least one department linked
insert into public.profile_departments (profile_id, department_id)
select p.id, coalesce(p.primary_department_id, (select id from public.departments where name = 'Tech'))
from public.profiles p
where not exists (
  select 1 from public.profile_departments pd where pd.profile_id = p.id
)
on conflict do nothing;

-- 8. Enable RLS and grant full authenticated access for HRMS operations
alter table public.hrms_roles enable row level security;
alter table public.departments enable row level security;
alter table public.profile_departments enable row level security;

drop policy if exists "auth_select_roles" on public.hrms_roles;
create policy "auth_all_roles" on public.hrms_roles for all to authenticated using (true) with check (true);

drop policy if exists "auth_select_departments" on public.departments;
create policy "auth_all_departments" on public.departments for all to authenticated using (true) with check (true);

drop policy if exists "auth_select_profile_departments" on public.profile_departments;
drop policy if exists "auth_all_profile_departments" on public.profile_departments;
create policy "auth_all_profile_departments" on public.profile_departments for all to authenticated using (true) with check (true);

-- Ensure profiles can be updated and inserted by authenticated users
drop policy if exists "auth_update_profiles" on public.profiles;
create policy "auth_update_profiles" on public.profiles for update to authenticated using (true) with check (true);

drop policy if exists "auth_insert_profiles" on public.profiles;
create policy "auth_insert_profiles" on public.profiles for insert to authenticated with check (true);
