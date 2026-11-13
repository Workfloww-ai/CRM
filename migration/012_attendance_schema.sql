-- =========================================================================
-- 012_attendance_schema.sql
-- Attendance tracking with geo-fencing (PostGIS) for Flowwies HRMS
-- =========================================================================

-- Enable PostGIS extension (for geo-fencing)
create extension if not exists postgis;

-- 1. Sites / Office Locations
create table if not exists public.attendance_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,                          -- e.g. "Mumbai HQ", "Delhi Office"
  address text,
  latitude double precision not null,
  longitude double precision not null,
  radius_meters int not null default 200,       -- geo-fence radius
  geofence geography(Point, 4326),              -- PostGIS geography point
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-populate geofence from lat/lng
create or replace function update_site_geofence()
returns trigger as $$
begin
  new.geofence := ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)::geography;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_site_geofence on attendance_sites;
create trigger trg_site_geofence
  before insert or update of latitude, longitude on attendance_sites
  for each row execute function update_site_geofence();

-- 2. Employee ↔ Site assignment (which employees belong to which site)
create table if not exists public.employee_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  site_id uuid not null references attendance_sites(id) on delete cascade,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, site_id)
);

-- 3. Shifts
create table if not exists public.attendance_shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,                         -- e.g. "Morning", "General", "Night"
  start_time time not null default '09:00',
  end_time time not null default '18:00',
  grace_minutes int not null default 15,      -- late tolerance
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- Seed a default shift
insert into attendance_shifts (name, start_time, end_time, grace_minutes, is_default)
values ('General', '09:00', '18:00', 15, true)
on conflict do nothing;

-- 4. Attendance Records (the core table)
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  site_id uuid references attendance_sites(id) on delete set null,
  shift_id uuid references attendance_shifts(id) on delete set null,

  -- Check-in
  check_in_at timestamptz,
  check_in_latitude double precision,
  check_in_longitude double precision,
  check_in_within_geofence boolean default false,
  check_in_selfie_path text,                  -- Cloud Storage / Supabase Storage path
  check_in_source text default 'web',         -- 'web' | 'whatsapp' | 'app'

  -- Check-out
  check_out_at timestamptz,
  check_out_latitude double precision,
  check_out_longitude double precision,
  check_out_within_geofence boolean default false,
  check_out_selfie_path text,

  -- Computed
  date date not null default current_date,    -- attendance date (for easy querying)
  status text not null default 'checked_in'
    check (status in ('checked_in', 'checked_out', 'absent', 'on_leave', 'holiday', 'half_day')),
  is_late boolean default false,
  work_hours numeric(4,2),                    -- calculated on check-out
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for fast lookups
create index if not exists idx_attendance_user_date on attendance_records(user_id, date);
create index if not exists idx_attendance_date on attendance_records(date);
create index if not exists idx_attendance_site on attendance_records(site_id);
create index if not exists idx_attendance_status on attendance_records(status);
create index if not exists idx_employee_sites_user on employee_sites(user_id);

-- 5. Enable RLS
alter table attendance_sites enable row level security;
alter table employee_sites enable row level security;
alter table attendance_shifts enable row level security;
alter table attendance_records enable row level security;

-- RLS policies — full access for authenticated (service role bypasses anyway)
drop policy if exists "auth_all_sites" on attendance_sites;
create policy "auth_all_sites" on attendance_sites for all to authenticated using (true) with check (true);

drop policy if exists "auth_all_employee_sites" on employee_sites;
create policy "auth_all_employee_sites" on employee_sites for all to authenticated using (true) with check (true);

drop policy if exists "auth_all_shifts" on attendance_shifts;
create policy "auth_all_shifts" on attendance_shifts for all to authenticated using (true) with check (true);

drop policy if exists "auth_all_attendance" on attendance_records;
create policy "auth_all_attendance" on attendance_records for all to authenticated using (true) with check (true);

-- 6. Helper function: check if a point is within a site's geofence
create or replace function is_within_geofence(
  check_lat double precision,
  check_lng double precision,
  p_site_id uuid
) returns boolean as $$
declare
  site_record record;
begin
  select latitude, longitude, radius_meters into site_record
  from attendance_sites where id = p_site_id;

  if not found then return false; end if;

  return ST_DWithin(
    ST_SetSRID(ST_MakePoint(check_lng, check_lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(site_record.longitude, site_record.latitude), 4326)::geography,
    site_record.radius_meters
  );
end;
$$ language plpgsql;

-- 7. Helper function: find nearest site to a given point
create or replace function find_nearest_site(
  check_lat double precision,
  check_lng double precision
) returns table(
  site_id uuid,
  site_name text,
  distance_meters double precision,
  within_geofence boolean
) as $$
begin
  return query
  select
    s.id as site_id,
    s.name as site_name,
    ST_Distance(
      ST_SetSRID(ST_MakePoint(check_lng, check_lat), 4326)::geography,
      s.geofence
    ) as distance_meters,
    ST_DWithin(
      ST_SetSRID(ST_MakePoint(check_lng, check_lat), 4326)::geography,
      s.geofence,
      s.radius_meters
    ) as within_geofence
  from attendance_sites s
  where s.is_active = true
  order by distance_meters asc
  limit 5;
end;
$$ language plpgsql;
