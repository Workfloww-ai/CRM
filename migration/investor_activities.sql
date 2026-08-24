create table investor_activities (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid references investors(id) on delete cascade not null,
  user_id uuid references profiles(id) not null,
  type text not null check (type in ('note', 'status_change', 'created')),
  content text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table investor_activities enable row level security;
create policy "auth select investor_activities" on investor_activities for select using (auth.role() = 'authenticated');
create policy "auth insert investor_activities" on investor_activities for insert with check (auth.role() = 'authenticated');

create table training_partner_activities (
  id uuid primary key default gen_random_uuid(),
  training_partner_id uuid references training_partners(id) on delete cascade not null,
  user_id uuid references profiles(id) not null,
  type text not null check (type in ('note', 'status_change', 'created')),
  content text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table training_partner_activities enable row level security;
create policy "auth select training_partner_activities" on training_partner_activities for select using (auth.role() = 'authenticated');
create policy "auth insert training_partner_activities" on training_partner_activities for insert with check (auth.role() = 'authenticated');
