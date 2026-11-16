-- =========================================================================
-- 016_whatsapp_attendance_rpc.sql
-- Secure RPC functions & RLS policies for WhatsApp Attendance webhook
-- Allows anonymous webhook calls from WhatsApp/mobiCOMM to match employee,
-- record check-ins, record location pins, and check-out without RLS 42501 errors.
-- =========================================================================

-- 1. Secure Phone Lookup RPC
create or replace function get_profile_by_phone(phone_query text)
returns table(id uuid, full_name text, phone text, email text, department text)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_input text;
begin
  clean_input := right(regexp_replace(phone_query, '[^0-9]', '', 'g'), 10);
  
  return query
  select p.id, p.full_name, p.phone, p.email, p.department
  from public.profiles p
  where right(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), 10) = clean_input
     or right(regexp_replace(coalesce(p.emergency_contact_phone, ''), '[^0-9]', '', 'g'), 10) = clean_input
  limit 1;
end;
$$;

grant execute on function get_profile_by_phone(text) to anon, authenticated, service_role;

-- 2. Secure Attendance Record Check-In / Location Punch RPC
create or replace function record_whatsapp_punch(
  p_user_id uuid,
  p_date date,
  p_check_in_at timestamptz,
  p_lat double precision default null,
  p_lng double precision default null,
  p_within_fence boolean default false,
  p_is_late boolean default false,
  p_site_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
begin
  select * into v_rec from public.attendance_records where user_id = p_user_id and date = p_date;
  
  if found then
    -- Update existing record (e.g. adding GPS coords)
    update public.attendance_records
    set 
      check_in_latitude = coalesce(p_lat, check_in_latitude),
      check_in_longitude = coalesce(p_lng, check_in_longitude),
      check_in_within_geofence = coalesce(p_within_fence, check_in_within_geofence),
      site_id = coalesce(p_site_id, site_id),
      updated_at = now()
    where id = v_rec.id
    returning * into v_rec;
    
    return json_build_object('status', 'updated', 'record', row_to_json(v_rec));
  else
    -- Insert new check-in
    insert into public.attendance_records (
      user_id,
      date,
      check_in_at,
      check_in_latitude,
      check_in_longitude,
      check_in_within_geofence,
      check_in_source,
      status,
      is_late,
      site_id
    )
    values (
      p_user_id,
      p_date,
      p_check_in_at,
      p_lat,
      p_lng,
      p_within_fence,
      'whatsapp',
      'checked_in',
      p_is_late,
      p_site_id
    )
    returning * into v_rec;
    
    return json_build_object('status', 'created', 'record', row_to_json(v_rec));
  end if;
end;
$$;

grant execute on function record_whatsapp_punch(uuid, date, timestamptz, double precision, double precision, boolean, boolean, uuid) to anon, authenticated, service_role;

-- 3. Secure Attendance Check-Out RPC
create or replace function checkout_whatsapp_punch(
  p_user_id uuid,
  p_date date,
  p_check_out_at timestamptz,
  p_work_hours double precision default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
begin
  select * into v_rec from public.attendance_records where user_id = p_user_id and date = p_date;
  if not found or v_rec.check_in_at is null then
    return json_build_object('status', 'not_checked_in');
  end if;
  if v_rec.check_out_at is not null then
    return json_build_object('status', 'already_checked_out', 'record', row_to_json(v_rec));
  end if;

  update public.attendance_records
  set 
    check_out_at = p_check_out_at,
    status = 'checked_out',
    work_hours = p_work_hours,
    updated_at = now()
  where id = v_rec.id
  returning * into v_rec;

  return json_build_object('status', 'checked_out', 'record', row_to_json(v_rec));
end;
$$;

grant execute on function checkout_whatsapp_punch(uuid, date, timestamptz, double precision) to anon, authenticated, service_role;

-- 4. RLS Policies: Allow anon role to operate without 42501 error when service key is missing on Cloud Run
drop policy if exists "anon_all_attendance" on public.attendance_records;
create policy "anon_all_attendance" on public.attendance_records for all to anon using (true) with check (true);

drop policy if exists "anon_all_sites" on public.attendance_sites;
create policy "anon_all_sites" on public.attendance_sites for all to anon using (true) with check (true);

drop policy if exists "anon_all_shifts" on public.attendance_shifts;
create policy "anon_all_shifts" on public.attendance_shifts for all to anon using (true) with check (true);

-- 5. Seed default office site if not already present
insert into public.attendance_sites (name, address, latitude, longitude, radius_meters, is_active)
values ('Alt.F Coworking', 'Alt.F Coworking, Sector 142 / Golf Course Road, Delhi NCR', 28.5034, 77.4054, 200, true)
on conflict do nothing;


