create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "authenticated users can read profiles"
on profiles for select
using (auth.role() = 'authenticated');