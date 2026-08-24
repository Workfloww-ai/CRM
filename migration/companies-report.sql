create table company_reports (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  storage_path text,
  error_message text,
  requested_by uuid references profiles(id) not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table company_reports enable row level security;

create policy "authenticated users can read company reports"
on company_reports for select
using (auth.role() = 'authenticated');



create policy "authenticated users can view company reports"
on storage.objects for select
using (bucket_id = 'company-reports' and auth.role() = 'authenticated');