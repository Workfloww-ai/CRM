-- =========================================================================
-- 005_hrms_flowwies_schema.sql
-- Flowwies HRMS database schema migration
-- Supports dual-role leadership (Shilpa & Manish), cross-functional Growth/Tech,
-- CRM access gating, Leave, Reimbursements, Payslips, Policies, and Talent.
-- =========================================================================

-- 1. Extend profiles table
alter table profiles
  add column if not exists emp_code text unique,
  add column if not exists department text not null default 'Operations',
  add column if not exists secondary_department text,
  add column if not exists hrms_role text not null default 'employee' check (hrms_role in ('employee', 'manager', 'admin')),
  add column if not exists can_access_crm boolean not null default false,
  add column if not exists manager_id uuid references profiles(id) on delete set null,
  add column if not exists is_active boolean not null default true,
  add column if not exists avatar_color text default '#E6E0FF',
  add column if not exists dob date,
  add column if not exists date_joined date default current_date,
  add column if not exists phone text,
  add column if not exists personal_email text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists pin_code text,
  add column if not exists bank_account_holder text,
  add column if not exists bank_name text,
  add column if not exists bank_account_number text,
  add column if not exists ifsc_code text,
  add column if not exists upi_id text;

-- Fast index for manager lookup and departments
create index if not exists idx_profiles_manager on profiles(manager_id);
create index if not exists idx_profiles_dept on profiles(department);
create index if not exists idx_profiles_can_access_crm on profiles(can_access_crm);

-- Default CRM access for existing Growth members and Admins
update profiles
set can_access_crm = true
where department = 'Growth' 
   or secondary_department = 'Growth' 
   or role_level >= 1;

-- 2. Leave Types & Status
do $$ begin
  create type hrms_leave_type as enum ('Casual', 'Sick', 'Earned');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type hrms_leave_status as enum ('pending', 'approved', 'declined', 'withdrawn');
exception
  when duplicate_object then null;
end $$;

create table if not exists leave_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  year int not null default extract(year from current_date),
  casual_days numeric(4,1) not null default 8.0,
  sick_days numeric(4,1) not null default 6.0,
  earned_days numeric(4,1) not null default 12.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, year)
);

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  leave_type hrms_leave_type not null,
  start_date date not null,
  end_date date not null,
  days_count numeric(4,1) not null,
  reason text not null,
  status hrms_leave_status not null default 'pending',
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_leave_requests_user on leave_requests(user_id);
create index if not exists idx_leave_requests_status on leave_requests(status);
create index if not exists idx_leave_requests_dates on leave_requests(start_date, end_date);

-- 3. Reimbursement Claims & Status
do $$ begin
  create type hrms_claim_status as enum ('pending', 'approved', 'declined', 'paid', 'withdrawn');
exception
  when duplicate_object then null;
end $$;

create table if not exists reimbursement_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  amount numeric(10,2) not null check (amount > 0),
  claim_date date not null default current_date,
  receipt_storage_path text,
  receipt_file_name text,
  is_image boolean default false,
  status hrms_claim_status not null default 'pending',
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  paid_by uuid references profiles(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_reimbursements_user on reimbursement_claims(user_id);
create index if not exists idx_reimbursements_status on reimbursement_claims(status);

-- 4. Payslips & Insurance Cover
create table if not exists payslips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  month_year text not null, -- e.g. "September 2026"
  pay_period_date date not null,
  net_amount numeric(10,2) not null,
  pdf_storage_path text,
  published_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_payslips_user on payslips(user_id);

create table if not exists insurance_cover (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  policy_number text not null,
  cover_amount text not null default '₹5,00,000',
  dependents text not null default 'Self',
  ecard_storage_path text,
  updated_at timestamptz default now()
);

-- 5. Company Policies & Holidays
create table if not exists company_policies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  punchline text not null,
  body text not null,
  sort_order int not null default 0,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists company_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name text not null,
  year int not null default extract(year from current_date)
);

-- Seed initial holidays if not existing
insert into company_holidays (holiday_date, name, year)
values 
  ('2026-10-02', 'Gandhi Jayanti', 2026),
  ('2026-10-20', 'Dussehra', 2026),
  ('2026-11-08', 'Diwali', 2026)
on conflict (holiday_date) do nothing;

-- 6. Talent of the Month, Cheers & Hall of Flex
create table if not exists talent_of_the_month (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  month_year text not null, -- e.g. "October 2026"
  why_text text not null,
  cheers_count int not null default 0,
  is_current boolean not null default false,
  crowned_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists talent_nominations (
  id uuid primary key default gen_random_uuid(),
  nominee_id uuid not null references profiles(id) on delete cascade,
  nominated_by uuid not null references profiles(id) on delete cascade,
  why_text text not null,
  created_at timestamptz not null default now()
);

-- Enable RLS as defense in depth (FastAPI service role handles actual auth)
alter table leave_balances enable row level security;
alter table leave_requests enable row level security;
alter table reimbursement_claims enable row level security;
alter table payslips enable row level security;
alter table insurance_cover enable row level security;
alter table company_policies enable row level security;
alter table company_holidays enable row level security;
alter table talent_of_the_month enable row level security;
alter table talent_nominations enable row level security;

-- Basic authenticated select policies
create policy "auth_select_leave_balances" on leave_balances for select using (auth.role() = 'authenticated');
create policy "auth_select_leave_requests" on leave_requests for select using (auth.role() = 'authenticated');
create policy "auth_select_reimbursements" on reimbursement_claims for select using (auth.role() = 'authenticated');
create policy "auth_select_payslips" on payslips for select using (auth.role() = 'authenticated');
create policy "auth_select_insurance" on insurance_cover for select using (auth.role() = 'authenticated');
create policy "auth_select_policies" on company_policies for select using (auth.role() = 'authenticated');
create policy "auth_select_holidays" on company_holidays for select using (auth.role() = 'authenticated');
create policy "auth_select_talent" on talent_of_the_month for select using (auth.role() = 'authenticated');
create policy "auth_select_nominations" on talent_nominations for select using (auth.role() = 'authenticated');
