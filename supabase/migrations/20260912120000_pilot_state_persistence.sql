-- Render's service filesystem is ephemeral. Keep pilot identities, password
-- hashes and account history in Supabase so a deploy or restart cannot erase
-- the login source of truth.
create table if not exists public.pilot_state (
  singleton boolean primary key default true check (singleton),
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.pilot_state enable row level security;
