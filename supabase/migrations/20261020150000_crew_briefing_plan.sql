-- A room briefing deliberately references a pilot-owned booking instead of
-- copying it.  Other pilots can use the published service as a quick booking
-- target, but never inherit access to the PIC's private operational record.
create table if not exists public.crew_voice_room_briefings (
  room_id uuid primary key references public.crew_voice_rooms(id) on delete cascade,
  pic_pilot_id text not null,
  booking_id text null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists crew_voice_room_briefings_pic_pilot_id_idx
  on public.crew_voice_room_briefings (pic_pilot_id);
