-- =========================================================================
-- 016_support_all_channels_in_action_items.sql
-- Updates action_items to support Consulting Partners (training_partners)
-- and Fractional Leaders (fractional_leaders) alongside Direct Channel (leads).
-- =========================================================================

-- 1. Allow lead_id to be nullable so action items can link to training partners or fractional leaders
alter table public.action_items alter column lead_id drop not null;

-- 2. Add channel tag, source_insight, and foreign key references
alter table public.action_items add column if not exists channel text not null default 'direct_channel';
alter table public.action_items add column if not exists source_insight text null;
alter table public.action_items add column if not exists training_partner_id uuid references public.training_partners(id) on delete cascade null;
alter table public.action_items add column if not exists fractional_leader_id uuid references public.fractional_leaders(id) on delete cascade null;

-- 3. Remove foreign key on activity_id so it can store activity IDs from any activity table
alter table public.action_items drop constraint if exists action_items_activity_id_fkey;

-- 4. Backfill source_insight for existing lead action items if available
update public.action_items a
set source_insight = l.content
from public.lead_activities l
where a.activity_id = l.id and a.source_insight is null;

-- 5. Add indexes
create index if not exists idx_action_items_tp_id on public.action_items(training_partner_id);
create index if not exists idx_action_items_fl_id on public.action_items(fractional_leader_id);
create index if not exists idx_action_items_channel on public.action_items(channel);
