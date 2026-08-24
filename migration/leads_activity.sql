create table lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade not null,
  user_id uuid references profiles(id) not null,
  type text not null check (type in ('note', 'status_change', 'created')),
  content text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table lead_activities enable row level security;

create policy "authenticated users can read activities"
on lead_activities for select
using (auth.role() = 'authenticated');

create policy "authenticated users can insert activities"
on lead_activities for insert
with check (auth.role() = 'authenticated');