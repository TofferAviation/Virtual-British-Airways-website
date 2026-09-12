-- Approved aircraft photography for the Fleet desktop and staff views.
-- One curated image is kept per aircraft.  The original source and credit are
-- retained so that the team can meet the source's attribution requirements.

create table if not exists public.aircraft_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  aircraft_id uuid not null references public.aircraft(id) on delete cascade,
  image_url text not null check (image_url ~* '^https://'),
  source_name text not null,
  credit text,
  source_page_url text check (source_page_url is null or source_page_url ~* '^https://'),
  approved_by_subject text not null,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists aircraft_images_one_per_aircraft
  on public.aircraft_images(aircraft_id);

create index if not exists aircraft_images_organization_idx
  on public.aircraft_images(organization_id);

alter table public.aircraft_images enable row level security;
