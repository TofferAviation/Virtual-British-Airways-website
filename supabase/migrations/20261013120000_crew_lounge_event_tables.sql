-- Crew Lounge event tables are anchored to published BAV calendar events by
-- the authenticated service. They are voluntary planning spaces only; they do
-- not represent an assignment, registration, booking or operational roster.

alter table public.crew_room_messages
  drop constraint if exists crew_room_messages_channel_check;

alter table public.crew_room_messages
  add constraint crew_room_messages_channel_check
  check (
    channel = 'crew-lounge'
    or channel ~ '^event:[a-z0-9][a-z0-9-]{0,79}$'
  );

create table if not exists public.crew_room_settings (
  id text primary key check (id = 'crew-lounge'),
  featured_event_id text,
  host_name text not null default 'BAV Community' check (char_length(host_name) between 1 and 80),
  host_message text not null check (char_length(host_message) between 1 and 360),
  welcome_prompt text not null check (char_length(welcome_prompt) between 1 and 160),
  updated_at timestamptz not null default now()
);

insert into public.crew_room_settings (id, host_name, host_message, welcome_prompt)
values (
  'crew-lounge',
  'BAV Community',
  'The Crew Lounge is open. Pull up a chair, share a route idea, and make another pilot feel welcome.',
  'What are you planning to fly next?'
)
on conflict (id) do nothing;

create table if not exists public.crew_room_intentions (
  id uuid primary key,
  event_id text not null,
  pilot_id text not null,
  pilot_number text not null,
  pilot_name text not null,
  pilot_rank text not null,
  flight_number text,
  route text,
  aircraft text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (event_id, pilot_id)
);

create index if not exists crew_room_intentions_event_updated_idx
  on public.crew_room_intentions (event_id, updated_at desc);

alter table public.crew_room_settings enable row level security;
alter table public.crew_room_intentions enable row level security;
