create policy "Allow authenticated inserts" on company_reports for insert to authenticated with check (true);
create policy "Allow authenticated updates" on company_reports for update to authenticated using (true);
