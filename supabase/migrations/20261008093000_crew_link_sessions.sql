-- Private Ember CrewLink rooms. Service-role API access only; pilot identity
-- and authority are verified by the BAV ACARS bearer token in application code.

create table if not exists public.crew_link_sessions (
  id uuid primary key,
  invite_code text not null unique,
  host_pilot_id text not null,
  booking_id text not null,
  flight_number text not null,
  departure_station text not null,
  arrival_station text not null,
  aircraft text not null,
  status text not null check (status in ('open', 'active', 'closed', 'expired')),
  control_owner_pilot_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crew_link_sessions_host_updated_idx
  on public.crew_link_sessions (host_pilot_id, updated_at desc);
create index if not exists crew_link_sessions_expiry_idx
  on public.crew_link_sessions (expires_at);

create table if not exists public.crew_link_members (
  id uuid primary key,
  crew_link_session_id uuid not null references public.crew_link_sessions(id) on delete cascade,
  pilot_id text not null,
  pilot_number text not null,
  pilot_name text not null,
  role text not null check (role in ('captain', 'first_officer', 'observer')),
  simulator text check (simulator in ('xplane12', 'msfs2020', 'msfs2024')),
  simulator_connected boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz
);

create unique index if not exists crew_link_members_one_active_membership_idx
  on public.crew_link_members (crew_link_session_id, pilot_id)
  where left_at is null;
create index if not exists crew_link_members_pilot_active_idx
  on public.crew_link_members (pilot_id, last_seen_at desc)
  where left_at is null;

alter table public.crew_link_sessions enable row level security;
alter table public.crew_link_members enable row level security;
