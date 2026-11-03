-- =========================================================================
-- 014_add_delete_activity_policy.sql
-- Enables DELETE policy on lead_activities (and other activity tables)
-- so authenticated users/admins can delete insights & activity notes.
-- =========================================================================

drop policy if exists "authenticated users can delete activities" on public.lead_activities;
create policy "authenticated users can delete activities"
on public.lead_activities for delete
to authenticated
using (true);

-- Also add delete policy for other activity tables for consistency
drop policy if exists "authenticated users can delete fractional_leader_activities" on public.fractional_leader_activities;
create policy "authenticated users can delete fractional_leader_activities"
on public.fractional_leader_activities for delete
to authenticated
using (true);

drop policy if exists "authenticated users can delete investor_activities" on public.investor_activities;
create policy "authenticated users can delete investor_activities"
on public.investor_activities for delete
to authenticated
using (true);

drop policy if exists "authenticated users can delete training_partner_activities" on public.training_partner_activities;
create policy "authenticated users can delete training_partner_activities"
on public.training_partner_activities for delete
to authenticated
using (true);

