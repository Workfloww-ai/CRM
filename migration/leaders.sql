-- 1. Investors Table
create table investors (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  title text,
  email text,
  phone text,
  phone_2 text,
  company text,
  industry text,
  function text,
  linkedin text,
  location text,
  revenue numeric,
  currency text default 'INR',
  status lead_status not null default 'New',
  next_action text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 2. Fractional Leaders Table
create table fractional_leaders (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  title text,
  email text,
  phone text,
  phone_2 text,
  domain text,
  industry text,
  function text,
  linkedin text,
  location text,
  revenue numeric,
  currency text default 'INR',
  status lead_status not null default 'New',
  next_action text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 3. Training Partners Table
create table training_partners (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  title text,
  email text,
  phone text,
  phone_2 text,
  organization text,
  industry text,
  function text,
  linkedin text,
  location text,
  revenue numeric,
  currency text default 'INR',
  status lead_status not null default 'New',
  next_action text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Note: To make yourself a super admin, run this query with your email:
-- update profiles set role_level = 2 where email = 'your_email@example.com';

