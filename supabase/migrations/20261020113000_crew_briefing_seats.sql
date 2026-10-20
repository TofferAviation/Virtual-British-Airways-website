-- A chair is a small piece of durable room state. Media itself remains WebRTC-only.
alter table public.crew_voice_peer_sessions
  add column if not exists seat_index smallint;

alter table public.crew_voice_peer_sessions
  drop constraint if exists crew_voice_peer_sessions_seat_index_check;

alter table public.crew_voice_peer_sessions
  add constraint crew_voice_peer_sessions_seat_index_check
  check (seat_index is null or seat_index between 1 and 8);

create unique index if not exists crew_voice_peer_sessions_one_chair_per_room
  on public.crew_voice_peer_sessions (room_id, seat_index)
  where seat_index is not null;

-- Existing lounge rooms were created before the dedicated eight-seat briefing room.
-- Keep future staff-configured rooms flexible, but bring the live pilot-room baseline
-- to the eight seats supported by the present peer-to-peer transport.
update public.crew_voice_rooms
set max_participants = 8,
    updated_at = timezone('utc', now())
where max_participants is null or max_participants < 8;
