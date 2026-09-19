-- A one-decimal VA-point adjustment for completed ACARS flights that begin
-- after the booked schedule time. Tier points remain unchanged.
alter table public.pilot_pireps
  alter column points_awarded type numeric(10, 1) using points_awarded::numeric(10, 1),
  add column if not exists late_start_penalty_points numeric(10, 1) not null default 0;
