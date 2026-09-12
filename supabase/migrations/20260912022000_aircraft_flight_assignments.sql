-- A registration may be selected freely for any route, but only one pilot can
-- actively reserve or operate a physical airframe at a time.

create table if not exists public.aircraft_flight_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  aircraft_id uuid not null references public.aircraft(id),
  pilot_subject text not null check (char_length(trim(pilot_subject)) between 2 and 200),
  pilot_display_name text not null check (char_length(trim(pilot_display_name)) between 2 and 160),
  flight_reference text not null check (char_length(trim(flight_reference)) between 2 and 80),
  departure_station text,
  arrival_station text,
  status text not null default 'reserved' check (status in ('reserved', 'operating', 'completed', 'cancelled')),
  reserved_at timestamptz not null default now(),
  off_block_at timestamptz,
  on_block_at timestamptz,
  block_minutes integer check (block_minutes is null or block_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists aircraft_flight_assignment_active_aircraft_idx
  on public.aircraft_flight_assignments (organization_id, aircraft_id)
  where status in ('reserved', 'operating');
create unique index if not exists aircraft_flight_assignment_active_pilot_idx
  on public.aircraft_flight_assignments (organization_id, pilot_subject)
  where status in ('reserved', 'operating');
create index if not exists aircraft_flight_assignment_aircraft_idx
  on public.aircraft_flight_assignments (aircraft_id, created_at desc);

create or replace function public.fleet_aircraft_availability(p_aircraft_id uuid)
returns table (dispatch_status text, available boolean, reasons jsonb)
language sql stable as $$
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
      union all select 'Aircraft is already reserved or operating'
        from public.aircraft_flight_assignments a where a.aircraft_id = p_aircraft_id and a.status in ('reserved', 'operating')
    ) all_reasons
  )
  select case when coalesce(jsonb_array_length(reasons.value), 0) > 0 then 'not_dispatchable' else target.dispatch_status end,
         coalesce(jsonb_array_length(reasons.value), 0) = 0 and target.dispatch_status <> 'not_dispatchable',
         coalesce(reasons.value, '[]'::jsonb)
  from target cross join reasons;
$$;

create or replace function public.fleet_reserve_aircraft_for_flight(
  p_organization_id uuid, p_aircraft_id uuid, p_pilot_subject text, p_pilot_display_name text,
  p_flight_reference text, p_departure_station text, p_arrival_station text,
  p_actor_subject text, p_actor_role text, p_request_id uuid
) returns public.aircraft_flight_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_aircraft public.aircraft;
  v_assignment public.aircraft_flight_assignments;
  v_previous public.aircraft_flight_assignments;
  v_available boolean;
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  if p_request_id is null then raise exception 'Request ID is required.'; end if;
  if char_length(trim(coalesce(p_pilot_subject, ''))) < 2 or char_length(trim(coalesce(p_flight_reference, ''))) < 2 then raise exception 'Pilot and flight reference are required.'; end if;
  select * into v_aircraft from public.aircraft where id = p_aircraft_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Aircraft was not found in this organization.' using errcode = 'P0002'; end if;
  select * into v_assignment from public.aircraft_flight_assignments
    where organization_id = p_organization_id and aircraft_id = p_aircraft_id and pilot_subject = p_pilot_subject and status in ('reserved', 'operating')
    order by created_at desc limit 1 for update;
  if found then
    if v_assignment.flight_reference = upper(trim(p_flight_reference)) then return v_assignment; end if;
    if v_assignment.status = 'operating' then raise exception 'You already have an aircraft operating. Complete that flight before selecting another registration.'; end if;
    update public.aircraft_flight_assignments set status = 'cancelled', updated_at = now() where id = v_assignment.id;
  end if;
  select * into v_previous from public.aircraft_flight_assignments
    where organization_id = p_organization_id and pilot_subject = p_pilot_subject and status in ('reserved', 'operating')
    order by created_at desc limit 1 for update;
  if found then
    if v_previous.status = 'operating' then raise exception 'You already have an aircraft operating. Complete that flight before selecting another registration.'; end if;
    update public.aircraft_flight_assignments set status = 'cancelled', updated_at = now() where id = v_previous.id;
    update public.aircraft set operational_status = case when operational_status = 'assigned' then 'available' else operational_status end, next_assigned_flight_reference = null, status_version = status_version + 1, updated_at = now() where id = v_previous.aircraft_id;
  end if;
  select available into v_available from public.fleet_aircraft_availability(p_aircraft_id);
  if not coalesce(v_available, false) then raise exception 'This registration is unavailable for selection.'; end if;
  insert into public.aircraft_flight_assignments (organization_id, aircraft_id, pilot_subject, pilot_display_name, flight_reference, departure_station, arrival_station)
  values (p_organization_id, p_aircraft_id, trim(p_pilot_subject), trim(p_pilot_display_name), upper(trim(p_flight_reference)), nullif(upper(trim(p_departure_station)), ''), nullif(upper(trim(p_arrival_station)), ''))
  returning * into v_assignment;
  update public.aircraft set operational_status = 'assigned', next_assigned_flight_reference = v_assignment.flight_reference, status_version = status_version + 1, updated_at = now() where id = p_aircraft_id;
  insert into public.aircraft_status_history (organization_id, aircraft_id, previous_operational_status, operational_status, previous_technical_status, technical_status, previous_dispatch_status, dispatch_status, reason, station, effective_at, source, request_id, changed_by_subject, changed_by_role)
  values (p_organization_id, p_aircraft_id, v_aircraft.operational_status, 'assigned', v_aircraft.technical_status, v_aircraft.technical_status, v_aircraft.dispatch_status, v_aircraft.dispatch_status, 'Reserved for ' || v_assignment.flight_reference || ' by ' || v_assignment.pilot_display_name, v_assignment.departure_station, now(), 'cabin_controls', p_request_id, p_actor_subject, p_actor_role);
  insert into public.fleet_audit_events (organization_id, aircraft_id, action, entity_type, entity_id, after_value, reason, actor_subject, actor_role, client_source, request_id)
  values (p_organization_id, p_aircraft_id, 'flight.assignment.reserved', 'aircraft_flight_assignment', v_assignment.id, to_jsonb(v_assignment), 'Aircraft reserved for flight', p_actor_subject, p_actor_role, 'cabin_controls', p_request_id);
  return v_assignment;
end;
$$;

create or replace function public.fleet_start_reserved_aircraft_flight(
  p_organization_id uuid, p_aircraft_id uuid, p_pilot_subject text, p_flight_reference text,
  p_actor_subject text, p_actor_role text, p_request_id uuid
) returns public.aircraft_flight_assignments
language plpgsql security definer set search_path = public as $$
declare v_aircraft public.aircraft; v_assignment public.aircraft_flight_assignments;
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  select * into v_aircraft from public.aircraft where id = p_aircraft_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Aircraft was not found in this organization.' using errcode = 'P0002'; end if;
  select * into v_assignment from public.aircraft_flight_assignments where organization_id = p_organization_id and aircraft_id = p_aircraft_id and pilot_subject = p_pilot_subject and flight_reference = upper(trim(p_flight_reference)) and status in ('reserved', 'operating') order by created_at desc limit 1 for update;
  if not found then raise exception 'Reserve this registration before starting the aircraft.'; end if;
  if v_assignment.status = 'operating' then return v_assignment; end if;
  update public.aircraft_flight_assignments set status = 'operating', off_block_at = now(), updated_at = now() where id = v_assignment.id returning * into v_assignment;
  update public.aircraft set operational_status = 'in_service', status_version = status_version + 1, updated_at = now() where id = p_aircraft_id;
  insert into public.aircraft_status_history (organization_id, aircraft_id, previous_operational_status, operational_status, previous_technical_status, technical_status, previous_dispatch_status, dispatch_status, reason, station, effective_at, source, request_id, changed_by_subject, changed_by_role)
  values (p_organization_id, p_aircraft_id, v_aircraft.operational_status, 'in_service', v_aircraft.technical_status, v_aircraft.technical_status, v_aircraft.dispatch_status, v_aircraft.dispatch_status, 'Pushback / engine start: ' || v_assignment.flight_reference, v_assignment.departure_station, v_assignment.off_block_at, 'cabin_controls', p_request_id, p_actor_subject, p_actor_role);
  insert into public.aircraft_log_entries (organization_id, aircraft_id, reference, occurred_at, station, category, description, entered_by_subject, source)
  values (p_organization_id, p_aircraft_id, 'FLTSTART-' || replace(v_assignment.id::text, '-', ''), v_assignment.off_block_at, v_assignment.departure_station, 'flight', 'Flight ' || v_assignment.flight_reference || ' started by ' || v_assignment.pilot_display_name, p_actor_subject, 'cabin_controls');
  return v_assignment;
end;
$$;

create or replace function public.fleet_complete_reserved_aircraft_flight(
  p_organization_id uuid, p_aircraft_id uuid, p_pilot_subject text, p_flight_reference text, p_arrival_station text,
  p_actor_subject text, p_actor_role text, p_request_id uuid
) returns public.aircraft_flight_assignments
language plpgsql security definer set search_path = public as $$
declare v_aircraft public.aircraft; v_assignment public.aircraft_flight_assignments; v_flight public.aircraft_flights; v_completed_at timestamptz := now(); v_minutes integer;
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  select * into v_aircraft from public.aircraft where id = p_aircraft_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Aircraft was not found in this organization.' using errcode = 'P0002'; end if;
  select * into v_assignment from public.aircraft_flight_assignments where organization_id = p_organization_id and aircraft_id = p_aircraft_id and pilot_subject = p_pilot_subject and flight_reference = upper(trim(p_flight_reference)) order by created_at desc limit 1 for update;
  if not found then raise exception 'No aircraft assignment was found for this flight.'; end if;
  if v_assignment.status = 'completed' then return v_assignment; end if;
  if v_assignment.status <> 'operating' then raise exception 'Aircraft operation has not started yet.'; end if;
  v_minutes := greatest(1, round(extract(epoch from (v_completed_at - v_assignment.off_block_at)) / 60.0)::integer);
  select * into v_flight from public.fleet_complete_flight(p_organization_id, p_aircraft_id, v_assignment.id,
    jsonb_build_object('flightReference', v_assignment.flight_reference, 'departureStation', v_assignment.departure_station, 'arrivalStation', coalesce(nullif(upper(trim(p_arrival_station)), ''), v_assignment.arrival_station), 'offBlockAt', v_assignment.off_block_at, 'onBlockAt', v_completed_at, 'blockMinutes', v_minutes, 'flightCycles', 1, 'source', 'cabin_controls'), p_actor_subject, p_actor_role);
  update public.aircraft_flight_assignments set status = 'completed', arrival_station = coalesce(nullif(upper(trim(p_arrival_station)), ''), arrival_station), on_block_at = v_completed_at, block_minutes = v_minutes, updated_at = now() where id = v_assignment.id returning * into v_assignment;
  update public.aircraft set operational_status = case when operational_status in ('assigned', 'in_service') then 'available' else operational_status end, next_assigned_flight_reference = null, status_version = status_version + 1, updated_at = now() where id = p_aircraft_id;
  insert into public.aircraft_status_history (organization_id, aircraft_id, previous_operational_status, operational_status, previous_technical_status, technical_status, previous_dispatch_status, dispatch_status, reason, station, effective_at, source, request_id, changed_by_subject, changed_by_role)
  values (p_organization_id, p_aircraft_id, v_aircraft.operational_status, case when v_aircraft.operational_status in ('assigned', 'in_service') then 'available' else v_aircraft.operational_status end, v_aircraft.technical_status, v_aircraft.technical_status, v_aircraft.dispatch_status, v_aircraft.dispatch_status, 'Flight ' || v_assignment.flight_reference || ' completed', v_assignment.arrival_station, v_completed_at, 'cabin_controls', p_request_id, p_actor_subject, p_actor_role);
  insert into public.fleet_audit_events (organization_id, aircraft_id, action, entity_type, entity_id, after_value, reason, actor_subject, actor_role, client_source, request_id)
  values (p_organization_id, p_aircraft_id, 'flight.assignment.completed', 'aircraft_flight_assignment', v_assignment.id, to_jsonb(v_assignment), 'Aircraft operation completed', p_actor_subject, p_actor_role, 'cabin_controls', p_request_id);
  return v_assignment;
end;
$$;

create or replace function public.fleet_cancel_aircraft_reservation(
  p_organization_id uuid, p_aircraft_id uuid, p_pilot_subject text, p_flight_reference text,
  p_actor_subject text, p_actor_role text, p_request_id uuid
) returns public.aircraft_flight_assignments
language plpgsql security definer set search_path = public as $$
declare v_aircraft public.aircraft; v_assignment public.aircraft_flight_assignments;
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  select * into v_aircraft from public.aircraft where id = p_aircraft_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Aircraft was not found in this organization.' using errcode = 'P0002'; end if;
  select * into v_assignment from public.aircraft_flight_assignments where organization_id = p_organization_id and aircraft_id = p_aircraft_id and pilot_subject = p_pilot_subject and flight_reference = upper(trim(p_flight_reference)) and status = 'reserved' order by created_at desc limit 1 for update;
  if not found then raise exception 'Only a reservation that has not started can be released.'; end if;
  update public.aircraft_flight_assignments set status = 'cancelled', updated_at = now() where id = v_assignment.id returning * into v_assignment;
  update public.aircraft set operational_status = case when operational_status = 'assigned' then 'available' else operational_status end, next_assigned_flight_reference = null, status_version = status_version + 1, updated_at = now() where id = p_aircraft_id;
  insert into public.aircraft_status_history (organization_id, aircraft_id, previous_operational_status, operational_status, previous_technical_status, technical_status, previous_dispatch_status, dispatch_status, reason, station, effective_at, source, request_id, changed_by_subject, changed_by_role)
  values (p_organization_id, p_aircraft_id, v_aircraft.operational_status, case when v_aircraft.operational_status = 'assigned' then 'available' else v_aircraft.operational_status end, v_aircraft.technical_status, v_aircraft.technical_status, v_aircraft.dispatch_status, v_aircraft.dispatch_status, 'Flight reservation released: ' || v_assignment.flight_reference, v_assignment.departure_station, now(), 'cabin_controls', p_request_id, p_actor_subject, p_actor_role);
  return v_assignment;
end;
$$;

alter table public.aircraft_flight_assignments enable row level security;

revoke all on function public.fleet_reserve_aircraft_for_flight(uuid, uuid, text, text, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.fleet_start_reserved_aircraft_flight(uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.fleet_complete_reserved_aircraft_flight(uuid, uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.fleet_cancel_aircraft_reservation(uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated;
