-- A community-approved hero image belongs to one published Crew Lounge event.
-- Objects stay in a private bucket and are streamed only through authenticated
-- staff and Ember ACARS endpoints; the calendar's official event imagery is
-- deliberately left untouched.

create table if not exists public.crew_room_event_media (
  event_id text primary key,
  hero_object_key text not null,
  hero_content_type text not null check (hero_content_type in ('image/jpeg', 'image/png')),
  updated_at timestamptz not null default now()
);

alter table public.crew_room_event_media enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crew-lounge-media',
  'crew-lounge-media',
  false,
  5242880,
  array['image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png']::text[];

-- The website service role owns uploads and reads. No browser or anonymous
-- Storage policy is created: Ember receives a hero only through its
-- bearer-authenticated Crew Lounge endpoint.
