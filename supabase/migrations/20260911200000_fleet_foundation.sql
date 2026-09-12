-- FreeFlight Fleet Foundation
--
-- This migration establishes the authoritative, organization-scoped operational
-- aircraft record. It deliberately stores no real aircraft seed data: aircraft
-- identity, hours, cycles and maintenance history must be imported or entered
-- by authorised staff.

create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{2,24}$'),
  name text not null check (char_length(trim(name)) between 2 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The current website owns authentication. `external_subject` is the stable
-- website staff/pilot identifier until those accounts are migrated to Supabase Auth.
create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  external_subject text not null check (char_length(trim(external_subject)) between 1 and 200),
  display_name text not null check (char_length(trim(display_name)) between 1 and 160),
  role_code text not null check (role_code in (
    'super_admin', 'airline_administrator', 'fleet_manager',
    'maintenance_controller', 'operations_controller', 'cabin_operations',
    'dispatcher', 'pilot', 'cabin_crew', 'viewer'
  )),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_subject)
);

create table public.aircraft_configurations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null check (char_length(trim(code)) between 2 and 80),
  name text not null check (char_length(trim(name)) between 2 and 160),
  aircraft_family text not null,
  aircraft_model text not null,
  variant text,
  cabin_layout_id text,
  configuration_version text,
  cabin_definition jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.aircraft (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  configuration_id uuid references public.aircraft_configurations(id),
  registration text not null check (registration = upper(registration) and registration ~ '^[A-Z0-9-]{2,16}$'),
  fleet_number text,
  manufacturer text,
  aircraft_model text not null,
  variant text,
  aircraft_family text,
  icao_type text,
  iata_type text,
  msn text,
  operator_name text,
  owner_name text,
  lessor_name text,
  subfleet text,
  home_base text,
  current_station text,
  operational_role text,
  entry_into_service_date date,
  delivery_date date,
  manufacture_year smallint check (manufacture_year is null or manufacture_year between 1900 and 2200),
  current_livery text,
  airframe_hours_minutes bigint not null default 0 check (airframe_hours_minutes >= 0),
  airframe_cycles bigint not null default 0 check (airframe_cycles >= 0),
  engine_data jsonb not null default '[]'::jsonb,
  apu_data jsonb not null default '{}'::jsonb,
  operational_status text not null default 'available' check (operational_status in (
    'available', 'scheduled', 'assigned', 'in_service', 'turnaround',
    'standby', 'ferry', 'positioning', 'storage', 'retired'
  )),
  technical_status text not null default 'serviceable' check (technical_status in (
    'serviceable', 'serviceable_with_deferred_defects', 'inspection_required',
    'scheduled_maintenance', 'in_maintenance', 'grounded', 'aog',
    'awaiting_parts', 'awaiting_engineering', 'repaint', 'damage_inspection'
  )),
  dispatch_status text not null default 'dispatchable' check (dispatch_status in (
    'dispatchable', 'dispatchable_with_restrictions', 'not_dispatchable'
  )),
  status_version bigint not null default 1 check (status_version > 0),
  last_flight_at timestamptz,
  next_assigned_flight_reference text,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, registration),
  check (technical_status not in ('grounded', 'aog', 'in_maintenance', 'repaint', 'damage_inspection') or dispatch_status = 'not_dispatchable'),
  check (operational_status <> 'retired' or dispatch_status = 'not_dispatchable')
);

create table public.aircraft_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  aircraft_id uuid not null references public.aircraft(id),
  previous_operational_status text,
  operational_status text not null,
  previous_technical_status text,
  technical_status text not null,
  previous_dispatch_status text,
  dispatch_status text not null,
  reason text not null check (char_length(trim(reason)) between 3 and 2000),
  remarks text,
  station text,
  effective_at timestamptz not null,
  source text not null check (source in ('website', 'cabin_controls', 'acars', 'system', 'import')),
  request_id uuid not null,
  changed_by_subject text not null,
  changed_by_role text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, request_id)
);

create table public.aircraft_log_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  aircraft_id uuid not null references public.aircraft(id),
  reference text not null,
  occurred_at timestamptz not null,
  station text,
  category text not null check (category in (
    'flight', 'defect', 'maintenance', 'inspection', 'rectification',
    'deferred_defect', 'damage', 'component', 'release_to_service',
    'repaint', 'status', 'system'
  )),
  description text not null check (char_length(trim(description)) between 3 and 8000),
  related_flight_id uuid,
  related_defect_id uuid,
  status text not null default 'recorded' check (status in ('recorded', 'corrected', 'voided', 'superseded')),
  attachment_metadata jsonb not null default '[]'::jsonb,
  entered_by_subject text not null,
  source text not null,
  correction_of_id uuid references public.aircraft_log_entries(id),
  created_at timestamptz not null default now(),
  unique (organization_id, reference)
);

create table public.aircraft_defects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  aircraft_id uuid not null references public.aircraft(id),
  reference text not null,
  reported_at timestamptz not null,
  reporting_station text,
  reporter_subject text not null,
  reporter_role text not null,
  source text not null check (source in ('flight_crew', 'cabin_crew', 'ground', 'maintenance', 'simulator', 'administrator', 'system')),
  category text not null,
  ata_chapter text,
  cabin_zone text,
  seat_number text,
  galley_position text,
  lavatory_position text,
  door_position text,
  equipment_position text,
  description text not null check (char_length(trim(description)) between 3 and 8000),
  severity text not null check (severity in ('low', 'normal', 'high', 'critical')),
  operational_impact text,
  dispatch_impact text not null default 'none' check (dispatch_impact in ('none', 'restriction', 'blocking')),
  cabin_impact text,
  status text not null default 'reported' check (status in (
    'reported', 'under_review', 'inspection_required', 'deferred',
    'maintenance_scheduled', 'work_in_progress', 'awaiting_parts',
    'awaiting_engineering', 'rectified', 'closed', 'voided'
  )),
  assigned_team text,
  rectification_action text,
  closed_at timestamptz,
  closed_by_subject text,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reference)
);

create table public.aircraft_defect_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  defect_id uuid not null references public.aircraft_defects(id),
  action_type text not null check (action_type in ('reported', 'reviewed', 'inspection', 'deferred', 'assigned', 'work_started', 'parts_requested', 'rectified', 'closed', 'voided')),
  details text not null check (char_length(trim(details)) between 3 and 8000),
  station text,
  performed_at timestamptz not null,
  performed_by_subject text not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, request_id)
);

create table public.deferred_defects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  defect_id uuid not null unique references public.aircraft_defects(id),
  deferral_kind text not null check (deferral_kind in ('mel', 'cdl', 'airline_rule')),
  reference text not null,
  restriction text not null,
  operational_procedure text,
  maintenance_procedure text,
  deferred_at timestamptz not null,
  due_at timestamptz,
  due_cycles bigint check (due_cycles is null or due_cycles >= 0),
  due_hours_minutes bigint check (due_hours_minutes is null or due_hours_minutes >= 0),
  approved_by_subject text not null,
  cleared_at timestamptz,
  cleared_by_subject text,
  created_at timestamptz not null default now(),
  unique (organization_id, reference)
);

create table public.aircraft_damage_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  aircraft_id uuid not null references public.aircraft(id),
  reference text not null,
  reported_at timestamptz not null,
  station text,
  reporter_subject text not null,
  location text not null,
  damage_type text not null,
  description text not null,
  severity text not null check (severity in ('minor', 'major', 'critical')),
  inspection_required boolean not null default true,
  engineering_assessment text,
  operational_restriction text,
  repair_required boolean not null default false,
  status text not null default 'reported' check (status in ('reported', 'awaiting_inspection', 'inspected', 'repair_required', 'repair_scheduled', 'repair_in_progress', 'repaired', 'closed', 'voided')),
  attachment_metadata jsonb not null default '[]'::jsonb,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reference)
);

create table public.maintenance_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null,
  name text not null,
  aircraft_family text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  maintenance_program_id uuid not null references public.maintenance_programs(id),
  code text not null,
  name text not null,
  due_date date,
  due_hours_minutes bigint check (due_hours_minutes is null or due_hours_minutes >= 0),
  due_cycles bigint check (due_cycles is null or due_cycles >= 0),
  upcoming_date_days integer not null default 30 check (upcoming_date_days >= 0),
  upcoming_hours_minutes bigint not null default 6000 check (upcoming_hours_minutes >= 0),
  upcoming_cycles bigint not null default 30 check (upcoming_cycles >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (maintenance_program_id, code),
  check (due_date is not null or due_hours_minutes is not null or due_cycles is not null)
);

create table public.maintenance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  aircraft_id uuid not null references public.aircraft(id),
  reference text not null,
  maintenance_type text not null,
  planned_start_at timestamptz,
  actual_start_at timestamptz,
  estimated_completion_at timestamptz,
  actual_completion_at timestamptz,
  location text,
  provider text,
  reason text not null,
  work_scope text,
  status text not null default 'planned' check (status in ('planned', 'scheduled', 'aircraft_awaited', 'in_progress', 'awaiting_parts', 'awaiting_inspection', 'awaiting_engineering', 'testing', 'completed', 'released', 'cancelled')),
  blocking boolean not null default true,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reference)
);

create table public.aircraft_repaints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  aircraft_id uuid not null references public.aircraft(id),
  reference text not null,
  current_livery text,
  new_livery text not null,
  paint_facility text,
  reason text,
  planned_start_at timestamptz,
  actual_start_at timestamptz,
  estimated_completion_at timestamptz,
  actual_completion_at timestamptz,
  status text not null default 'planned' check (status in ('planned', 'scheduled', 'awaiting_aircraft', 'in_repaint', 'inspection', 'completed', 'cancelled')),
  notes text,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reference)
);

create table public.aircraft_flights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  aircraft_id uuid not null references public.aircraft(id),
  external_event_id uuid not null,
  flight_reference text not null,
  departure_station text,
  arrival_station text,
  off_block_at timestamptz,
  on_block_at timestamptz,
  block_minutes integer not null check (block_minutes >= 0),
  airborne_minutes integer check (airborne_minutes is null or airborne_minutes >= 0),
  flight_cycles integer not null default 1 check (flight_cycles >= 0),
  source text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, external_event_id)
);

create table public.fleet_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  aircraft_id uuid references public.aircraft(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_value jsonb,
  after_value jsonb,
  reason text,
  actor_subject text not null,
  actor_role text not null,
  client_source text not null,
  request_id uuid not null,
  occurred_at timestamptz not null default now(),
  unique (organization_id, request_id)
);

create table public.fleet_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  aircraft_id uuid references public.aircraft(id),
  kind text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null,
  body text not null,
  recipient_role text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index aircraft_organization_registration_idx on public.aircraft (organization_id, registration);
create index aircraft_organization_current_station_idx on public.aircraft (organization_id, current_station);
create index aircraft_status_history_aircraft_effective_idx on public.aircraft_status_history (aircraft_id, effective_at desc);
create index aircraft_log_entries_aircraft_occurred_idx on public.aircraft_log_entries (aircraft_id, occurred_at desc);
create index aircraft_defects_aircraft_status_idx on public.aircraft_defects (aircraft_id, status);
create index aircraft_damage_aircraft_status_idx on public.aircraft_damage_records (aircraft_id, status);
create index maintenance_events_aircraft_status_idx on public.maintenance_events (aircraft_id, status);
create index aircraft_flights_aircraft_on_block_idx on public.aircraft_flights (aircraft_id, on_block_at desc);
create index fleet_audit_events_aircraft_occurred_idx on public.fleet_audit_events (aircraft_id, occurred_at desc);

-- Centralised read model for dispatch decisions. Command handlers must still
-- validate transitions and sign-off permissions before writing any state.
create or replace function public.fleet_aircraft_availability(p_aircraft_id uuid)
returns table (dispatch_status text, available boolean, reasons jsonb)
language sql
stable
as $$
  with target as (
    select * from public.aircraft where id = p_aircraft_id
  ), reasons as (
    select jsonb_agg(reason order by reason) as value
    from (
      select 'Aircraft is retired' as reason from target where operational_status in ('retired', 'storage')
      union all select 'Aircraft is AOG' from target where technical_status = 'aog'
      union all select 'Aircraft is grounded' from target where technical_status = 'grounded'
      union all select 'Aircraft is in maintenance' from target where technical_status = 'in_maintenance'
      union all select 'Aircraft is in repaint' from target where technical_status = 'repaint'
      union all select 'Aircraft requires damage inspection' from target where technical_status = 'damage_inspection'
      union all select 'Blocking maintenance event is active'
        from public.maintenance_events m where m.aircraft_id = p_aircraft_id and m.blocking and m.status in ('scheduled', 'aircraft_awaited', 'in_progress', 'awaiting_parts', 'awaiting_inspection', 'awaiting_engineering', 'testing')
      union all select 'Critical blocking defect is open'
        from public.aircraft_defects d where d.aircraft_id = p_aircraft_id and d.severity = 'critical' and d.dispatch_impact = 'blocking' and d.status not in ('rectified', 'closed', 'voided')
      union all select 'Critical damage record is open'
        from public.aircraft_damage_records d where d.aircraft_id = p_aircraft_id and d.severity = 'critical' and d.status not in ('repaired', 'closed', 'voided')
    ) all_reasons
  )
  select case when coalesce(jsonb_array_length(reasons.value), 0) > 0 then 'not_dispatchable' else target.dispatch_status end,
         coalesce(jsonb_array_length(reasons.value), 0) = 0 and target.dispatch_status <> 'not_dispatchable',
         coalesce(reasons.value, '[]'::jsonb)
  from target cross join reasons;
$$;

create or replace function public.prevent_fleet_history_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Fleet history is append-only; create a correction or void record instead.';
end;
$$;

create trigger aircraft_status_history_append_only before update or delete on public.aircraft_status_history
for each row execute function public.prevent_fleet_history_mutation();
create trigger aircraft_defect_actions_append_only before update or delete on public.aircraft_defect_actions
for each row execute function public.prevent_fleet_history_mutation();
create trigger fleet_audit_events_append_only before update or delete on public.fleet_audit_events
for each row execute function public.prevent_fleet_history_mutation();

-- Direct database access is denied. The website/Fleet API uses a server-only
-- secret and verifies the existing BAV staff session plus organization scope.
-- Future Supabase Auth migration may add narrowly scoped authenticated policies.
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.aircraft_configurations enable row level security;
alter table public.aircraft enable row level security;
alter table public.aircraft_status_history enable row level security;
alter table public.aircraft_log_entries enable row level security;
alter table public.aircraft_defects enable row level security;
alter table public.aircraft_defect_actions enable row level security;
alter table public.deferred_defects enable row level security;
alter table public.aircraft_damage_records enable row level security;
alter table public.maintenance_programs enable row level security;
alter table public.maintenance_tasks enable row level security;
alter table public.maintenance_events enable row level security;
alter table public.aircraft_repaints enable row level security;
alter table public.aircraft_flights enable row level security;
alter table public.fleet_audit_events enable row level security;
alter table public.fleet_notifications enable row level security;
