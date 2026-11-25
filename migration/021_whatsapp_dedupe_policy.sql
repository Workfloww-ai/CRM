-- =========================================================================
-- 021_whatsapp_dedupe_policy.sql
-- Ensure whatsapp_processed_messages exists and has full RLS access for anon
-- so webhook deduplication works reliably without 42501 permission errors.
-- =========================================================================

create table if not exists public.whatsapp_processed_messages (
  message_id text primary key,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.whatsapp_processed_messages enable row level security;

-- Policy: allow anon, authenticated, and service_role full access
drop policy if exists "allow_all_whatsapp_processed_messages" on public.whatsapp_processed_messages;
create policy "allow_all_whatsapp_processed_messages" on public.whatsapp_processed_messages
  for all to anon, authenticated, service_role
  using (true) with check (true);

-- Grant permissions
grant all on public.whatsapp_processed_messages to anon, authenticated, service_role;
