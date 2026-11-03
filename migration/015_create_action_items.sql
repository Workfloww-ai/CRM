-- =========================================================================
-- 015_create_action_items.sql
-- Creates action_items table to store tasks automatically extracted
-- from call insights by AI (OpenAI / Gemini).
-- =========================================================================

create table if not exists public.action_items (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade not null,
  user_id uuid references public.profiles(id) not null,
  activity_id uuid references public.lead_activities(id) on delete cascade null,
  task text not null,
  due_date date null,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

-- Indexes for performance
create index if not exists idx_action_items_lead_id on public.action_items(lead_id);
create index if not exists idx_action_items_user_id on public.action_items(user_id);
create index if not exists idx_action_items_status on public.action_items(status);
create index if not exists idx_action_items_due_date on public.action_items(due_date);

-- Enable Row Level Security
alter table public.action_items enable row level security;

-- Drop existing policies if any
drop policy if exists "authenticated users can read action_items" on public.action_items;
drop policy if exists "authenticated users can insert action_items" on public.action_items;
drop policy if exists "authenticated users can update action_items" on public.action_items;
drop policy if exists "authenticated users can delete action_items" on public.action_items;

-- Policies for authenticated users
create policy "authenticated users can read action_items"
on public.action_items for select
to authenticated
using (true);

create policy "authenticated users can insert action_items"
on public.action_items for insert
to authenticated
with check (true);

create policy "authenticated users can update action_items"
on public.action_items for update
to authenticated
using (true)
with check (true);

create policy "authenticated users can delete action_items"
on public.action_items for delete
to authenticated
using (true);

