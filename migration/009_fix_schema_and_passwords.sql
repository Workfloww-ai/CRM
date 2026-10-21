-- =========================================================================
-- 009_fix_schema_and_passwords.sql
-- Fixes "Database error querying schema" and restores Supabase Auth
-- =========================================================================

-- 1. Restore schema permissions
grant usage on schema public to postgres, anon, authenticated, service_role;
grant usage on schema extensions to postgres, anon, authenticated, service_role;

-- 2. Fix handle_new_user() without restrictive search_path
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3. Ensure pgcrypto extension is active
create extension if not exists pgcrypto;

-- 4. Set password to 'workfloww@2026' and auto-confirm all existing users
update auth.users
set 
  encrypted_password = crypt('workfloww@2026', gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now();

-- 5. Reload PostgREST schema cache
notify pgrst, 'reload schema';
