-- Staff-created Crew Lounge rooms. The website service authenticates pilots
-- before it returns these records; there is intentionally no direct browser
-- access to room administration or chat data.

create table if not exists public.crew_voice_rooms (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  name text not null check (char_length(name) between 1 and 80),
  description text not null check (char_length(description) between 1 and 240),
  event_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'open', 'closed')),
  meeting_key text not null unique check (char_length(meeting_key) between 16 and 96),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists crew_voice_rooms_visibility_idx
  on public.crew_voice_rooms (status, starts_at asc nulls last, created_at asc);

alter table public.crew_voice_rooms enable row level security;

alter table public.crew_room_messages
  drop constraint if exists crew_room_messages_channel_check;

alter table public.crew_room_messages
  add constraint crew_room_messages_channel_check
  check (
    channel = 'crew-lounge'
    or channel ~ '^event:[a-z0-9][a-z0-9-]{0,79}$'
    or channel ~ '^voice:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );
