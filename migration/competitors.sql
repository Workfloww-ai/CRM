create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  status text not null default 'New',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.competitors enable row level security;
create policy "auth select competitors" on public.competitors for select using (auth.role() = 'authenticated');
create policy "auth insert competitors" on public.competitors for insert with check (auth.role() = 'authenticated');
create policy "auth update competitors" on public.competitors for update using (auth.role() = 'authenticated');
create policy "auth delete competitors" on public.competitors for delete using (auth.role() = 'authenticated');

create table public.competitor_activities (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid references public.competitors(id) on delete cascade not null,
  user_id uuid references public.profiles(id) not null,
  type text not null check (type in ('note', 'status_change', 'created')),
  content text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.competitor_activities enable row level security;
create policy "auth select competitor_activities" on public.competitor_activities for select using (auth.role() = 'authenticated');
create policy "auth insert competitor_activities" on public.competitor_activities for insert with check (auth.role() = 'authenticated');
