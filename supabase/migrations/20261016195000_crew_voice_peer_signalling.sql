-- Durable, short-lived signalling for Crew Lounge WebRTC calls.
--
-- Audio, camera and screen media never pass through these tables: browsers
-- exchange only the setup messages required to make an encrypted direct or
-- TURN-relayed WebRTC connection. Rows are pruned by the website service when
-- a pilot leaves or has not polled for 90 seconds.

create table if not exists public.crew_voice_peer_sessions (
  id text primary key check (char_length(id) between 16 and 96),
  room_id uuid not null references public.crew_voice_rooms(id) on delete cascade,
  pilot_id text not null check (char_length(pilot_id) between 1 and 128),
  pilot_number text not null check (char_length(pilot_number) between 1 and 64),
  name text not null check (char_length(name) between 1 and 160),
  profile_image text,
  token_hash text not null check (char_length(token_hash) between 32 and 128),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, pilot_id)
);

create index if not exists crew_voice_peer_sessions_room_presence_idx
  on public.crew_voice_peer_sessions (room_id, last_seen_at desc, joined_at asc);

create table if not exists public.crew_voice_peer_signals (
  id uuid primary key default gen_random_uuid(),
  target_session_id text not null references public.crew_voice_peer_sessions(id) on delete cascade,
  sender_session_id text not null references public.crew_voice_peer_sessions(id) on delete cascade,
  kind text not null check (kind in ('offer', 'answer', 'candidate')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  check (target_session_id <> sender_session_id)
);

create index if not exists crew_voice_peer_signals_target_idx
  on public.crew_voice_peer_signals (target_session_id, created_at asc);

alter table public.crew_voice_peer_sessions enable row level security;
alter table public.crew_voice_peer_signals enable row level security;

-- There are deliberately no browser-facing policies. The website validates the
-- signed-in pilot before it reads or writes these transient records with its
-- server-only service credential.
