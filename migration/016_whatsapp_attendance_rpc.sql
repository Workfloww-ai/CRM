-- =========================================================================
-- 016_whatsapp_attendance_rpc.sql
-- Secure RPC functions for WhatsApp Attendance matching & recording
-- Uses SECURITY DEFINER so webhooks can look up employee phone & record
-- attendance securely without exposing tables to public anon queries.
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

-- Grant execute to anon, authenticated, service_role
grant execute on function get_profile_by_phone(text) to anon, authenticated, service_role;

-- 2. Secure Attendance Record Insert/Update RPC
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
