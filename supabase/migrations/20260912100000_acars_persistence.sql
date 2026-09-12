-- Durable ACARS sessions, position history and completed flight reports.
-- These tables are deliberately service-role only: all pilot authorization remains
-- in the application API, and no anonymous browser policy is granted here.

create table if not exists public.acars_sessions (
  id uuid primary key,
  pilot_id text not null,
  pilot_number text not null,
  pilot_name text not null,
  booking_id text not null,
  flight_number text not null,
  departure_station text not null,
  arrival_station text not null,
  aircraft text not null,
  simulator text not null check (simulator in ('xplane12', 'msfs2020', 'msfs2024')),
  status text not null check (status in ('active', 'completed', 'disconnected')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  first_fuel_kg double precision,
  last_fuel_kg double precision,
  distance_nm double precision not null default 0 check (distance_nm >= 0),
  landing_fpm integer,
  last_snapshot jsonb,
  recent_snapshots jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists acars_sessions_one_active_pilot_idx
  on public.acars_sessions (pilot_id)
  where status = 'active';
create index if not exists acars_sessions_live_updated_idx
  on public.acars_sessions (updated_at desc)
  where status = 'active';
create index if not exists acars_sessions_pilot_updated_idx
  on public.acars_sessions (pilot_id, updated_at desc);

create table if not exists public.acars_position_reports (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.acars_sessions(id) on delete cascade,
  reported_at timestamptz not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  altitude_ft double precision not null,
  ground_speed_kt double precision not null check (ground_speed_kt >= 0),
  heading_deg double precision not null check (heading_deg >= 0 and heading_deg <= 360),
  fuel_kg double precision,
  engines_running boolean not null,
  parking_brake_set boolean not null,
  on_ground boolean not null,
  vertical_speed_fpm double precision,
  created_at timestamptz not null default now()
);

create index if not exists acars_position_reports_session_time_idx
  on public.acars_position_reports (session_id, reported_at desc);

create table if not exists public.pilot_pireps (
  id uuid primary key,
  pilot_id text not null,
  booking_id text,
  flight_number text not null,
  departure_station text not null,
  arrival_station text not null,
  aircraft text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  block_minutes integer not null check (block_minutes >= 0),
  distance_nm double precision not null check (distance_nm >= 0),
  landing_fpm integer,
  fuel_used_kg double precision,
  points_awarded integer not null default 0,
  tier_points_awarded integer not null default 0,
  status text not null check (status in ('pending', 'changes_requested', 'accepted', 'rejected')),
  source text not null check (source in ('manual', 'acars')),
  simulator text not null check (simulator in ('xplane12', 'msfs2020', 'msfs2024')),
  acars_session_id uuid references public.acars_sessions(id) on delete set null,
  pilot_comments text not null default '',
  staff_comments text not null default '',
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now()
);

create unique index if not exists pilot_pireps_acars_session_idx
  on public.pilot_pireps (acars_session_id)
  where acars_session_id is not null;
create index if not exists pilot_pireps_pilot_created_idx
  on public.pilot_pireps (pilot_id, created_at desc);
create index if not exists pilot_pireps_created_idx
  on public.pilot_pireps (created_at desc);

alter table public.acars_sessions enable row level security;
alter table public.acars_position_reports enable row level security;
alter table public.pilot_pireps enable row level security;
