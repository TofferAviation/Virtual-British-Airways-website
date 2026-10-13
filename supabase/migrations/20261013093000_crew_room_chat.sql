-- Shared Crew Lounge conversation. Access remains service-role only: the
-- authenticated ACARS API decides which active BAV pilot may read or write.
-- This is a public BAV crew space, not a private-message system.

create table if not exists public.crew_room_messages (
  id uuid primary key,
  channel text not null check (channel in ('crew-lounge')),
  pilot_id text not null,
  pilot_number text not null,
  pilot_name text not null,
  pilot_rank text not null,
  body text not null check (char_length(body) between 1 and 600),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text
);

create index if not exists crew_room_messages_channel_created_idx
  on public.crew_room_messages (channel, created_at desc)
  where deleted_at is null;

create index if not exists crew_room_messages_pilot_created_idx
  on public.crew_room_messages (pilot_id, created_at desc);

alter table public.crew_room_messages enable row level security;
