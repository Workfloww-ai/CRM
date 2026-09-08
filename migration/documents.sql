-- Create Documents Table
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  folder text not null,
  file_name text not null,
  storage_path text not null,
  uploaded_by uuid references public.profiles(id) not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.documents enable row level security;
create policy "auth select documents" on public.documents for select using (auth.role() = 'authenticated');
create policy "auth insert documents" on public.documents for insert with check (auth.role() = 'authenticated');
create policy "auth delete documents" on public.documents for delete using (auth.role() = 'authenticated');

-- Create storage bucket
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict do nothing;

-- Storage bucket policies
create policy "authenticated users can view documents bucket" 
on storage.objects for select 
using (bucket_id = 'documents' and auth.role() = 'authenticated');

create policy "authenticated users can upload documents bucket" 
on storage.objects for insert 
with check (bucket_id = 'documents' and auth.role() = 'authenticated');

create policy "authenticated users can update documents bucket" 
on storage.objects for update 
using (bucket_id = 'documents' and auth.role() = 'authenticated');

create policy "authenticated users can delete documents bucket" 
on storage.objects for delete 
using (bucket_id = 'documents' and auth.role() = 'authenticated');
