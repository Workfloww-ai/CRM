-- =========================================================================
-- 010_repair_supabase_auth.sql
-- 
-- Fixes "Database error querying schema" by:
-- 1. Dropping blocking triggers on auth.users
-- 2. Replacing all NULL token strings with '' in auth.users (prevents Go scan crash)
-- 3. Resetting passwords to 'workfloww@2026' and auto-confirming emails
-- 4. Restoring full role permissions to supabase_auth_admin
-- 5. Creating a safe, complete create_team_user() RPC function
-- =========================================================================

-- 1. Drop blocking triggers on auth.users
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_updated on auth.users;

-- 2. Ensure pgcrypto extension exists in extensions or public
create extension if not exists pgcrypto with schema extensions;

-- 3. Fix ALL NULL values in auth.users that crash GoTrue's Go scanner ("converting NULL to string is unsupported")
update auth.users
set 
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  email_change = coalesce(email_change, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  reauthentication_token = coalesce(reauthentication_token, ''),
  aud = coalesce(aud, 'authenticated'),
  role = coalesce(role, 'authenticated'),
  is_super_admin = coalesce(is_super_admin, false),
  is_sso_user = coalesce(is_sso_user, false),
  is_anonymous = coalesce(is_anonymous, false),
  raw_app_meta_data = coalesce(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  encrypted_password = extensions.crypt('workfloww@2026', extensions.gen_salt('bf')),
  updated_at = now();

-- 4. Restore schema permissions to supabase_auth_admin and service roles
grant usage on schema public to postgres, anon, authenticated, service_role, supabase_auth_admin;
grant usage on schema auth to postgres, anon, authenticated, service_role, supabase_auth_admin;
grant usage on schema extensions to postgres, anon, authenticated, service_role, supabase_auth_admin;

grant all privileges on all tables in schema auth to postgres, service_role, supabase_auth_admin;
grant all privileges on all sequences in schema auth to postgres, service_role, supabase_auth_admin;
grant all privileges on all routines in schema auth to postgres, service_role, supabase_auth_admin;

grant all privileges on all tables in schema public to postgres, anon, authenticated, service_role, supabase_auth_admin;
grant all privileges on all sequences in schema public to postgres, anon, authenticated, service_role, supabase_auth_admin;
grant all privileges on all routines in schema public to postgres, anon, authenticated, service_role, supabase_auth_admin;

-- 5. Safe create_team_user() RPC function that populates all required GoTrue fields
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
    -- Insert into auth.users with non-null string fields expected by GoTrue
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      recovery_token,
      confirmation_token,
      email_change_token_new,
      email_change_token_current,
      email_change,
      phone_change,
      phone_change_token,
      reauthentication_token,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      is_sso_user,
      is_anonymous,
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
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', new_full_name),
      false,
      false,
      false,
      now(),
      now()
    );
  else
    -- Update password and confirm email in auth.users
    update auth.users
    set 
      encrypted_password = hashed_password,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      email_change_token_current = coalesce(email_change_token_current, ''),
      email_change = coalesce(email_change, ''),
      phone_change = coalesce(phone_change, ''),
      phone_change_token = coalesce(phone_change_token, ''),
      reauthentication_token = coalesce(reauthentication_token, ''),
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
grant execute on function public.create_team_user to authenticated, anon, service_role;

-- 6. Reload PostgREST schema cache
notify pgrst, 'reload schema';
