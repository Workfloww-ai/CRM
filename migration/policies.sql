alter table leads enable row level security;

create policy "authenticated users can read leads"
on leads for select
using (auth.role() = 'authenticated');

create policy "authenticated users can insert leads"
on leads for insert
with check (auth.role() = 'authenticated');

create policy "authenticated users can update leads"
on leads for update
using (auth.role() = 'authenticated');

create policy "authenticated users can delete leads"
on leads for delete
using (auth.role() = 'authenticated');



BUCKET

create policy "authenticated users can upload attachments"
on storage.objects for insert
with check (bucket_id = 'lead-attachments' and auth.role() = 'authenticated');

create policy "authenticated users can view attachments"
on storage.objects for select
using (bucket_id = 'lead-attachments' and auth.role() = 'authenticated');

create policy "authenticated users can delete attachments"
on storage.objects for delete
using (bucket_id = 'lead-attachments' and auth.role() = 'authenticated');