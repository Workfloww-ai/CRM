create table fractional_leader_activities (
  id uuid primary key default gen_random_uuid(),
  leader_id uuid references fractional_leaders(id) on delete cascade not null,
  user_id uuid references profiles(id) not null,
  type text not null check (type in ('note', 'status_change', 'created')),
  content text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table fractional_leader_activities enable row level security;

create policy "authenticated users can read fractional_leader_activities"
on fractional_leader_activities for select
using (auth.role() = 'authenticated');

create policy "authenticated users can insert fractional_leader_activities"
on fractional_leader_activities for insert
with check (auth.role() = 'authenticated');
