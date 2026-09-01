-- FlowMeter Mission Manager schema
create extension if not exists pgcrypto;

create table if not exists cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  created_at timestamptz not null default now()
);

create table if not exists wells (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references cities(id) on delete restrict,
  name text not null,
  code text default '',
  status text not null default 'not_installed' check (status in ('not_installed','installed','needs_followup','completed','inactive')),
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  created_at timestamptz not null default now()
);

create table if not exists snapshots (
  id uuid primary key default gen_random_uuid(),
  well_id uuid not null references wells(id) on delete cascade,
  type text not null check (type in ('installation','visit')),
  visit_date date not null,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  pipe_material text default '',
  pipe_diameter numeric,
  pipe_thickness numeric,
  lining_thickness numeric,
  signal_quality numeric check (signal_quality between 0 and 100),
  signal_power numeric check (signal_power between 0 and 100),
  sound_path text check (sound_path in ('Z','V')),
  transmitter_serial text default '',
  sensor_serial text default '',
  flow_lps numeric,
  notes text default '',
  follow_up boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists snapshot_media (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references snapshots(id) on delete cascade,
  media_type text not null check (media_type in ('photo','audio','receipt','screenshot','invoice')),
  storage_path text not null,
  original_name text,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create table if not exists missions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  city_id uuid references cities(id) on delete restrict,
  title text not null,
  notes text default '',
  start_time time,
  end_time time,
  status text not null default 'in_progress' check (status in ('planned','in_progress','done','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists mission_wells (
  mission_id uuid not null references missions(id) on delete cascade,
  well_id uuid not null references wells(id) on delete restrict,
  primary key (mission_id, well_id)
);

create table if not exists meal_expenses (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid unique not null references missions(id) on delete cascade,
  title text default 'غذا',
  amount numeric not null default 0,
  vendor text default '',
  notes text default '',
  follow_up boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists travel_segments (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  origin text not null,
  destination text not null,
  vehicle text default 'Snapp / Taxi',
  amount numeric not null default 0,
  date_time timestamptz,
  notes text default '',
  follow_up boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists other_expenses (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  title text not null,
  amount numeric not null default 0,
  notes text default '',
  follow_up boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists mission_media (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  category text not null check (category in ('meal','travel','other','mission')),
  media_type text not null check (media_type in ('photo','audio','receipt','screenshot','invoice')),
  storage_path text not null,
  original_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_wells_city on wells(city_id);
create index if not exists idx_snapshots_well_date on snapshots(well_id, visit_date desc);
create index if not exists idx_missions_city_date on missions(city_id, date desc);
create index if not exists idx_mission_wells_well on mission_wells(well_id);

-- Data API access for this public, no-login internal app.
-- RLS is intentionally not enabled because the project does not use authentication.
grant usage on schema public to anon;
grant select, insert, update, delete on all tables in schema public to anon;
grant usage, select on all sequences in schema public to anon;

-- Keep future public tables reachable by the browser client as well.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to anon;

-- Storage bucket for photos, audio, receipts and screenshots.
insert into storage.buckets (id, name, public)
values ('flowmeter-files', 'flowmeter-files', true)
on conflict (id) do update set public = true;

-- This app intentionally has no login. Files in this bucket are therefore public.
drop policy if exists "flowmeter public files" on storage.objects;
create policy "flowmeter public files"
on storage.objects for all
to anon
using (bucket_id = 'flowmeter-files')
with check (bucket_id = 'flowmeter-files');
