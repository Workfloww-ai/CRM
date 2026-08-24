create table public.leads (
  id uuid not null default gen_random_uuid (),
  title text null,
  org text null,
  email text null,
  phone text null,
  linkedin text null,
  location text null,
  status public.lead_status not null default 'New'::lead_status,
  next_action text null,
  due_date date null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  first_name text not null,
  last_name text null,
  phone_2 text null,
  constraint leads_pkey primary key (id)
) TABLESPACE pg_default;