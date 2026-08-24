-- NOTE: This file reflects the CURRENT schema after migration.
-- Original design used `role text check (role in ('admin','member'))`;
-- migrated to `role_level smallint` (0 = member, 1 = admin) to allow
-- adding tiers later without a schema change. See AGENTS.md decision log.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role_level smallint not null default 0 check (role_level >= 0),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "authenticated users can read profiles"
on profiles for select
using (auth.role() = 'authenticated');