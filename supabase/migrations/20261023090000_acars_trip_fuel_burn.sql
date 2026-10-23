-- Preserve an aircraft-reported fuel-used counter alongside remaining fuel.
-- The counter is the preferred PIREP value because it works across aircraft
-- with different tank systems and dispatch fuel loads.

alter table public.acars_sessions
  add column if not exists last_fuel_burn_kg double precision;

alter table public.acars_position_reports
  add column if not exists fuel_burn_kg double precision;
