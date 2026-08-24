create table attachments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade not null,
  file_name text not null,
  storage_path text not null,
  uploaded_by uuid references profiles(id) not null,
  created_at timestamptz not null default now()
);

alter table attachments enable row level security;

create policy "authenticated users can read attachment records"
on attachments for select
using (auth.role() = 'authenticated');

create policy "authenticated users can insert attachment records"
on attachments for insert
with check (auth.role() = 'authenticated');

create policy "authenticated users can delete attachment records"
on attachments for delete
using (auth.role() = 'authenticated');