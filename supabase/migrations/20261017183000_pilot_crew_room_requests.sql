-- Pilot-hosted Crew Lounge requests are reviewed by BAV staff before a room
-- is published.  Booking and pilot data are copied at request time so the
-- staff queue remains useful even when a flight is later changed or closed.

alter table public.crew_voice_rooms
  add column if not exists max_participants integer not null default 4
    check (max_participants between 2 and 8),
  add column if not exists banner_id text not null default 'lounge-evening',
  add column if not exists banner_object_key text,
  add column if not exists banner_content_type text
    check (banner_content_type is null or banner_content_type in ('image/jpeg', 'image/png'));

create table if not exists public.crew_room_requests (
  id uuid primary key,
  pilot_id text not null,
  pilot_number text not null,
  pilot_name text not null,
  pilot_rank text not null,
  booking_id text not null,
  flight_number text not null,
  route_from text not null,
  route_to text not null,
  aircraft text not null,
  flight_date date not null,
  departure_time text not null,
  arrival_time text not null,
  duration text not null,
  room_name text not null check (char_length(room_name) between 1 and 80),
  welcome_note text not null check (char_length(welcome_note) between 1 and 240),
  requested_capacity integer not null check (requested_capacity between 2 and 8),
  media_preferences jsonb not null default '["voice"]'::jsonb,
  banner_id text not null default 'lounge-evening',
  banner_object_key text,
  banner_content_type text check (banner_content_type is null or banner_content_type in ('image/jpeg', 'image/png')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  staff_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  voice_room_id uuid references public.crew_voice_rooms(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((banner_object_key is null and banner_content_type is null) or (banner_object_key is not null and banner_content_type is not null))
);

create index if not exists crew_room_requests_staff_queue_idx
  on public.crew_room_requests (status, flight_date asc, created_at asc);

create index if not exists crew_room_requests_pilot_history_idx
  on public.crew_room_requests (pilot_id, created_at desc);

alter table public.crew_room_requests enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crew-room-request-media',
  'crew-room-request-media',
  false,
  5242880,
  array['image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png']::text[];

-- The website service role performs review and media access.  Pilots receive
-- their approved room through authenticated website APIs; no direct storage
-- or database browser policy is intentionally exposed.
