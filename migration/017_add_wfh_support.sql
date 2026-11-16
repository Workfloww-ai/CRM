-- =========================================================================
-- 017_add_wfh_support.sql
-- Add WFH (Work From Home) support to HRMS Leave Requests & Calendar
-- =========================================================================

-- 1. Safely convert leave_type column to text so any leave type (WFH, Birthday, Monthly, Casual, Sick) is accepted
do $$
begin
  alter table public.leave_requests alter column leave_type type text;
exception
  when others then null;
end $$;

-- 2. Also add WFH to enum if enum is still referenced anywhere
do $$
begin
  alter type public.hrms_leave_type add value if not exists 'WFH';
exception
  when duplicate_object then null;
  when others then null;
end $$;

-- 3. Also allow 'wfh' in attendance_records status if marked via attendance check-in
do $$
begin
  alter table public.attendance_records drop constraint if exists attendance_records_status_check;
  alter table public.attendance_records add constraint attendance_records_status_check
    check (status in ('checked_in', 'checked_out', 'absent', 'on_leave', 'holiday', 'half_day', 'wfh'));
exception
  when others then null;
end $$;

