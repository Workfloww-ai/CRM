-- =========================================================================
-- 008_set_default_passwords.sql
-- 
-- 1. Fixes handle_new_user() trigger with ON CONFLICT (id) DO UPDATE
-- 2. Populates missing profiles into auth.users with password 'workfloww@2026'
-- 3. Sets password to 'workfloww@2026' and auto-confirms all users in auth.users
-- 4. Creates create_team_user() function for future users
-- =========================================================================

-- 1. Fix handle_new_user trigger function so it doesn't fail on duplicate keys
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    email = excluded.email;
  return new;
end;
$$;

-- 2. Enable pgcrypto for password hashing
create extension if not exists pgcrypto with schema extensions;

-- 3. Insert existing profiles into auth.users that don't exist in auth.users yet
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select 
  '00000000-0000-0000-0000-000000000000',
  p.id,
  'authenticated',
  'authenticated',
  lower(p.email),
  extensions.crypt('workfloww@2026', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('full_name', p.full_name),
  now(),
  now()
from public.profiles p
where not exists (
  select 1 from auth.users u where u.id = p.id or lower(u.email) = lower(p.email)
)
on conflict do nothing;

-- 4. Update all existing users in auth.users: set password to 'workfloww@2026' & auto-confirm email
update auth.users
set 
  encrypted_password = extensions.crypt('workfloww@2026', extensions.gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now();

-- 5. Create function to automatically add future users to BOTH Authentication and Profiles
create or replace function public.create_team_user(
  new_email text,
  new_full_name text,
  new_role text default 'employee',
  new_department text default 'Tech',
  new_password text default 'workfloww@2026'
)
returns uuid
language plpgsql
security definer
as $$
declare
  target_user_id uuid;
  hashed_password text;
  is_mgr boolean;
begin
  hashed_password := extensions.crypt(new_password, extensions.gen_salt('bf'));
  is_mgr := (lower(new_role) = 'manager');

  -- Check if user already exists in auth.users
  select id into target_user_id from auth.users where lower(email) = lower(new_email);

  if target_user_id is null then
    target_user_id := gen_random_uuid();
    -- Insert into auth.users (Authentication)
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      target_user_id,
      'authenticated',
      'authenticated',
      lower(new_email),
      hashed_password,
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', new_full_name),
      now(),
      now()
    );
  else
    -- Update password and confirm email in auth.users
    update auth.users
    set 
      encrypted_password = hashed_password,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
    where id = target_user_id;
  end if;

  -- Insert/update in public.profiles
  insert into public.profiles (
    id,
    full_name,
    email,
    role_level,
    hrms_role,
    department,
    can_access_crm,
    is_active,
    must_change_password
  ) values (
    target_user_id,
    new_full_name,
    lower(new_email),
    case when is_mgr then 1 else 0 end,
    case when is_mgr then 'manager' else 'employee' end,
    new_department,
    case when is_mgr or lower(new_department) = 'growth' then true else false end,
    true,
    true
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    hrms_role = excluded.hrms_role,
    role_level = excluded.role_level,
    department = excluded.department,
    can_access_crm = excluded.can_access_crm,
    is_active = true,
    must_change_password = true;

  return target_user_id;
end;
$$;

-- Grant execution to authenticated and anon users
grant execute on function public.create_team_user to authenticated, anon;
