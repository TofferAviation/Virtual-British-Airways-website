-- Render's filesystem is ephemeral. Store staff users, roles, invitations and
-- audit history in Supabase so access survives a deployment or instance restart.
create table if not exists public.staff_state (
  singleton boolean primary key default true check (singleton),
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.staff_state enable row level security;
