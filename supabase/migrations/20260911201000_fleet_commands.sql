-- FreeFlight Fleet operational command layer
--
-- The website validates staff permissions before calling these functions. These
-- RPCs then make every material operational change atomically: the master
-- record, history, technical log and audit trail either all commit or none do.

create or replace function public.fleet_assert_active_member(
  p_organization_id uuid,
  p_actor_subject text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id
      and external_subject = p_actor_subject
      and active
  ) then
    raise exception 'Active organization membership is required.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.fleet_create_aircraft(
  p_organization_id uuid,
  p_payload jsonb,
  p_actor_subject text,
  p_actor_role text,
  p_request_id uuid
) returns public.aircraft
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aircraft public.aircraft;
  v_existing_aircraft_id uuid;
  v_registration text := upper(trim(coalesce(p_payload ->> 'registration', '')));
  v_model text := trim(coalesce(p_payload ->> 'aircraftModel', ''));
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  if p_request_id is null then raise exception 'Request ID is required.'; end if;
  if v_registration !~ '^[A-Z0-9-]{2,16}$' then raise exception 'Registration must contain 2–16 uppercase letters, numbers or hyphens.'; end if;
  if char_length(v_model) < 2 then raise exception 'Aircraft model is required.'; end if;

  select nullif(after_value ->> 'aircraft_id', '')::uuid into v_existing_aircraft_id
  from public.fleet_audit_events
  where organization_id = p_organization_id and request_id = p_request_id;
  if v_existing_aircraft_id is not null then
    select * into v_aircraft from public.aircraft where id = v_existing_aircraft_id;
    return v_aircraft;
  end if;

  insert into public.aircraft (
    organization_id, configuration_id, registration, fleet_number, manufacturer,
    aircraft_model, variant, aircraft_family, icao_type, iata_type, msn,
    operator_name, owner_name, lessor_name, subfleet, home_base, current_station,
    operational_role, entry_into_service_date, delivery_date, manufacture_year,
    current_livery, airframe_hours_minutes, airframe_cycles, engine_data, apu_data
  ) values (
    p_organization_id,
    nullif(p_payload ->> 'configurationId', '')::uuid,
    v_registration,
    nullif(trim(p_payload ->> 'fleetNumber'), ''),
    nullif(trim(p_payload ->> 'manufacturer'), ''),
    v_model,
    nullif(trim(p_payload ->> 'variant'), ''),
    nullif(trim(p_payload ->> 'aircraftFamily'), ''),
    nullif(upper(trim(p_payload ->> 'icaoType')), ''),
    nullif(upper(trim(p_payload ->> 'iataType')), ''),
    nullif(trim(p_payload ->> 'msn'), ''),
    nullif(trim(p_payload ->> 'operatorName'), ''),
    nullif(trim(p_payload ->> 'ownerName'), ''),
    nullif(trim(p_payload ->> 'lessorName'), ''),
    nullif(trim(p_payload ->> 'subfleet'), ''),
    nullif(upper(trim(p_payload ->> 'homeBase')), ''),
    nullif(upper(trim(p_payload ->> 'currentStation')), ''),
    nullif(trim(p_payload ->> 'operationalRole'), ''),
    nullif(p_payload ->> 'entryIntoServiceDate', '')::date,
    nullif(p_payload ->> 'deliveryDate', '')::date,
    nullif(p_payload ->> 'manufactureYear', '')::smallint,
    nullif(trim(p_payload ->> 'currentLivery'), ''),
    greatest(0, coalesce(nullif(p_payload ->> 'airframeHoursMinutes', '')::bigint, 0)),
    greatest(0, coalesce(nullif(p_payload ->> 'airframeCycles', '')::bigint, 0)),
    coalesce(p_payload -> 'engineData', '[]'::jsonb),
    coalesce(p_payload -> 'apuData', '{}'::jsonb)
  ) returning * into v_aircraft;

  insert into public.aircraft_status_history (
    organization_id, aircraft_id, operational_status, technical_status, dispatch_status,
    reason, remarks, station, effective_at, source, request_id, changed_by_subject, changed_by_role
  ) values (
    p_organization_id, v_aircraft.id, v_aircraft.operational_status, v_aircraft.technical_status,
    v_aircraft.dispatch_status, 'Aircraft master record created', null, v_aircraft.current_station,
    now(), 'website', p_request_id, p_actor_subject, p_actor_role
  );

  insert into public.aircraft_log_entries (
    organization_id, aircraft_id, reference, occurred_at, station, category, description,
    entered_by_subject, source
  ) values (
    p_organization_id, v_aircraft.id, 'MASTER-' || replace(p_request_id::text, '-', ''), now(),
    v_aircraft.current_station, 'system', 'Aircraft master record created for ' || v_aircraft.registration,
    p_actor_subject, 'website'
  );

  insert into public.fleet_audit_events (
    organization_id, aircraft_id, action, entity_type, entity_id, after_value,
    reason, actor_subject, actor_role, client_source, request_id
  ) values (
    p_organization_id, v_aircraft.id, 'aircraft.created', 'aircraft', v_aircraft.id,
    jsonb_build_object('aircraft_id', v_aircraft.id, 'registration', v_aircraft.registration),
    'Aircraft master record created', p_actor_subject, p_actor_role, 'website', p_request_id
  );
  return v_aircraft;
end;
$$;

create or replace function public.fleet_transition_aircraft_status(
  p_organization_id uuid,
  p_aircraft_id uuid,
  p_expected_version bigint,
  p_operational_status text,
  p_technical_status text,
  p_dispatch_status text,
  p_action text,
  p_reason text,
  p_remarks text,
  p_station text,
  p_effective_at timestamptz,
  p_actor_subject text,
  p_actor_role text,
  p_request_id uuid,
  p_source text default 'website'
) returns public.aircraft
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.aircraft;
  v_after public.aircraft;
  v_has_blocker boolean;
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'A reason of at least 3 characters is required.'; end if;
  if p_action not in ('status_change', 'declare_aog', 'clear_aog', 'release_to_service', 'ground_aircraft', 'start_repaint', 'complete_repaint') then raise exception 'Unsupported fleet status action.'; end if;
  if p_source not in ('website', 'cabin_controls', 'acars', 'system', 'import') then raise exception 'Unsupported source.'; end if;

  select * into v_before from public.aircraft
  where id = p_aircraft_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Aircraft was not found in this organization.' using errcode = 'P0002'; end if;
  if v_before.status_version <> p_expected_version then raise exception 'This aircraft changed while you were editing it. Refresh and review the newer record.' using errcode = '40001'; end if;

  if p_operational_status not in ('available', 'scheduled', 'assigned', 'in_service', 'turnaround', 'standby', 'ferry', 'positioning', 'storage', 'retired')
     or p_technical_status not in ('serviceable', 'serviceable_with_deferred_defects', 'inspection_required', 'scheduled_maintenance', 'in_maintenance', 'grounded', 'aog', 'awaiting_parts', 'awaiting_engineering', 'repaint', 'damage_inspection')
     or p_dispatch_status not in ('dispatchable', 'dispatchable_with_restrictions', 'not_dispatchable') then
    raise exception 'Invalid operational, technical or dispatch status.';
  end if;
  if p_technical_status in ('grounded', 'aog', 'in_maintenance', 'repaint', 'damage_inspection') and p_dispatch_status <> 'not_dispatchable' then
    raise exception 'This technical condition requires Not Dispatchable.';
  end if;
  if p_operational_status = 'retired' and p_dispatch_status <> 'not_dispatchable' then raise exception 'Retired aircraft cannot be dispatchable.'; end if;
  if v_before.technical_status = 'aog' and p_technical_status <> 'aog' and p_action not in ('clear_aog', 'release_to_service') then
    raise exception 'An AOG aircraft must be cleared through the AOG or release-to-service workflow.';
  end if;
  if p_action = 'declare_aog' and p_technical_status <> 'aog' then raise exception 'Declare AOG requires technical status AOG.'; end if;
  if p_action in ('clear_aog', 'release_to_service') and p_actor_role not in ('super_admin', 'airline_administrator', 'maintenance_controller') then
    raise exception 'Maintenance authorization is required for this action.' using errcode = '42501';
  end if;
  if p_action = 'release_to_service' then
    if p_technical_status not in ('serviceable', 'serviceable_with_deferred_defects') then raise exception 'Release to service requires a serviceable technical condition.'; end if;
    select exists (
      select 1 from public.aircraft_defects where aircraft_id = p_aircraft_id and severity = 'critical' and dispatch_impact = 'blocking' and status not in ('rectified', 'closed', 'voided')
      union all
      select 1 from public.aircraft_damage_records where aircraft_id = p_aircraft_id and severity = 'critical' and status not in ('repaired', 'closed', 'voided')
      union all
      select 1 from public.maintenance_events where aircraft_id = p_aircraft_id and blocking and status in ('scheduled', 'aircraft_awaited', 'in_progress', 'awaiting_parts', 'awaiting_inspection', 'awaiting_engineering', 'testing')
    ) into v_has_blocker;
    if v_has_blocker then raise exception 'Release to service is blocked by an active critical defect, damage record or maintenance event.'; end if;
  end if;

  update public.aircraft set
    operational_status = p_operational_status,
    technical_status = p_technical_status,
    dispatch_status = p_dispatch_status,
    current_station = coalesce(nullif(upper(trim(p_station)), ''), current_station),
    status_version = status_version + 1,
    updated_at = now()
  where id = p_aircraft_id returning * into v_after;

  insert into public.aircraft_status_history (
    organization_id, aircraft_id, previous_operational_status, operational_status,
    previous_technical_status, technical_status, previous_dispatch_status, dispatch_status,
    reason, remarks, station, effective_at, source, request_id, changed_by_subject, changed_by_role
  ) values (
    p_organization_id, p_aircraft_id, v_before.operational_status, v_after.operational_status,
    v_before.technical_status, v_after.technical_status, v_before.dispatch_status, v_after.dispatch_status,
    p_reason, nullif(trim(p_remarks), ''), coalesce(nullif(upper(trim(p_station)), ''), v_after.current_station),
    coalesce(p_effective_at, now()), p_source, p_request_id, p_actor_subject, p_actor_role
  );
  insert into public.aircraft_log_entries (
    organization_id, aircraft_id, reference, occurred_at, station, category, description, entered_by_subject, source
  ) values (
    p_organization_id, p_aircraft_id, 'STATUS-' || replace(p_request_id::text, '-', ''), coalesce(p_effective_at, now()),
    coalesce(nullif(upper(trim(p_station)), ''), v_after.current_station),
    case when p_action = 'release_to_service' then 'release_to_service' else 'status' end,
    upper(replace(p_action, '_', ' ')) || ': ' || p_reason, p_actor_subject, p_source
  );
  insert into public.fleet_audit_events (
    organization_id, aircraft_id, action, entity_type, entity_id, before_value, after_value, reason,
    actor_subject, actor_role, client_source, request_id
  ) values (
    p_organization_id, p_aircraft_id, 'aircraft.' || p_action, 'aircraft', p_aircraft_id,
    to_jsonb(v_before), to_jsonb(v_after), p_reason, p_actor_subject, p_actor_role, p_source, p_request_id
  );
  if p_action = 'declare_aog' then
    insert into public.fleet_notifications (organization_id, aircraft_id, kind, severity, title, body, recipient_role)
    values (p_organization_id, p_aircraft_id, 'aircraft_aog', 'critical', 'Aircraft AOG: ' || v_after.registration, p_reason, 'maintenance_controller');
  elsif p_action = 'release_to_service' then
    insert into public.fleet_notifications (organization_id, aircraft_id, kind, severity, title, body)
    values (p_organization_id, p_aircraft_id, 'aircraft_released', 'info', 'Aircraft released to service: ' || v_after.registration, p_reason);
  end if;
  return v_after;
end;
$$;

create or replace function public.fleet_report_defect(
  p_organization_id uuid,
  p_aircraft_id uuid,
  p_payload jsonb,
  p_actor_subject text,
  p_actor_role text,
  p_request_id uuid
) returns public.aircraft_defects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aircraft public.aircraft;
  v_defect public.aircraft_defects;
  v_existing_defect_id uuid;
  v_is_blocking boolean;
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  select * into v_aircraft from public.aircraft where id = p_aircraft_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Aircraft was not found in this organization.' using errcode = 'P0002'; end if;
  select nullif(after_value ->> 'defect_id', '')::uuid into v_existing_defect_id
  from public.fleet_audit_events where organization_id = p_organization_id and request_id = p_request_id;
  if v_existing_defect_id is not null then select * into v_defect from public.aircraft_defects where id = v_existing_defect_id; return v_defect; end if;
  if char_length(trim(coalesce(p_payload ->> 'category', ''))) < 2 then raise exception 'Defect category is required.'; end if;
  if char_length(trim(coalesce(p_payload ->> 'description', ''))) < 3 then raise exception 'Defect description is required.'; end if;
  if coalesce(p_payload ->> 'severity', 'normal') not in ('low', 'normal', 'high', 'critical') then raise exception 'Invalid defect severity.'; end if;
  if coalesce(p_payload ->> 'dispatchImpact', 'none') not in ('none', 'restriction', 'blocking') then raise exception 'Invalid dispatch impact.'; end if;

  insert into public.aircraft_defects (
    organization_id, aircraft_id, reference, reported_at, reporting_station, reporter_subject, reporter_role,
    source, category, ata_chapter, cabin_zone, seat_number, galley_position, lavatory_position, door_position,
    equipment_position, description, severity, operational_impact, dispatch_impact, cabin_impact, assigned_team
  ) values (
    p_organization_id, p_aircraft_id, 'DEF-' || upper(left(replace(p_request_id::text, '-', ''), 10)),
    coalesce(nullif(p_payload ->> 'reportedAt', '')::timestamptz, now()), nullif(upper(trim(p_payload ->> 'station')), ''),
    p_actor_subject, p_actor_role, coalesce(nullif(p_payload ->> 'source', ''), 'administrator'),
    trim(p_payload ->> 'category'), nullif(trim(p_payload ->> 'ataChapter'), ''), nullif(trim(p_payload ->> 'cabinZone'), ''),
    nullif(upper(trim(p_payload ->> 'seatNumber')), ''), nullif(trim(p_payload ->> 'galleyPosition'), ''),
    nullif(trim(p_payload ->> 'lavatoryPosition'), ''), nullif(trim(p_payload ->> 'doorPosition'), ''),
    nullif(trim(p_payload ->> 'equipmentPosition'), ''), trim(p_payload ->> 'description'),
    coalesce(p_payload ->> 'severity', 'normal'), nullif(trim(p_payload ->> 'operationalImpact'), ''),
    coalesce(p_payload ->> 'dispatchImpact', 'none'), nullif(trim(p_payload ->> 'cabinImpact'), ''), nullif(trim(p_payload ->> 'assignedTeam'), '')
  ) returning * into v_defect;
  insert into public.aircraft_defect_actions (organization_id, defect_id, action_type, details, station, performed_at, performed_by_subject, request_id)
  values (p_organization_id, v_defect.id, 'reported', v_defect.description, v_defect.reporting_station, v_defect.reported_at, p_actor_subject, p_request_id);
  insert into public.aircraft_log_entries (organization_id, aircraft_id, reference, occurred_at, station, category, description, related_defect_id, entered_by_subject, source)
  values (p_organization_id, p_aircraft_id, 'LOG-' || replace(p_request_id::text, '-', ''), v_defect.reported_at, v_defect.reporting_station, 'defect', 'Defect ' || v_defect.reference || ': ' || v_defect.description, v_defect.id, p_actor_subject, 'website');
  v_is_blocking := v_defect.severity = 'critical' and v_defect.dispatch_impact = 'blocking';
  if v_is_blocking then
    update public.aircraft set technical_status = 'inspection_required', dispatch_status = 'not_dispatchable', status_version = status_version + 1, updated_at = now() where id = p_aircraft_id;
    insert into public.aircraft_status_history (organization_id, aircraft_id, previous_operational_status, operational_status, previous_technical_status, technical_status, previous_dispatch_status, dispatch_status, reason, station, effective_at, source, request_id, changed_by_subject, changed_by_role)
    values (p_organization_id, p_aircraft_id, v_aircraft.operational_status, v_aircraft.operational_status, v_aircraft.technical_status, 'inspection_required', v_aircraft.dispatch_status, 'not_dispatchable', 'Critical blocking defect reported: ' || v_defect.reference, v_defect.reporting_station, now(), 'website', gen_random_uuid(), p_actor_subject, p_actor_role);
  end if;
  insert into public.fleet_audit_events (organization_id, aircraft_id, action, entity_type, entity_id, after_value, reason, actor_subject, actor_role, client_source, request_id)
  values (p_organization_id, p_aircraft_id, 'defect.reported', 'aircraft_defect', v_defect.id, jsonb_build_object('defect_id', v_defect.id, 'reference', v_defect.reference), v_defect.description, p_actor_subject, p_actor_role, 'website', p_request_id);
  if v_defect.severity in ('high', 'critical') then
    insert into public.fleet_notifications (organization_id, aircraft_id, kind, severity, title, body, recipient_role)
    values (p_organization_id, p_aircraft_id, 'defect_reported', case when v_defect.severity = 'critical' then 'critical' else 'warning' end, 'Defect reported: ' || v_defect.reference, v_defect.description, 'maintenance_controller');
  end if;
  return v_defect;
end;
$$;

create or replace function public.fleet_complete_flight(
  p_organization_id uuid,
  p_aircraft_id uuid,
  p_external_event_id uuid,
  p_payload jsonb,
  p_actor_subject text,
  p_actor_role text
) returns public.aircraft_flights
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aircraft public.aircraft;
  v_flight public.aircraft_flights;
  v_block_minutes integer := greatest(0, coalesce(nullif(p_payload ->> 'blockMinutes', '')::integer, 0));
  v_cycles integer := greatest(0, coalesce(nullif(p_payload ->> 'flightCycles', '')::integer, 1));
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  select * into v_flight from public.aircraft_flights where organization_id = p_organization_id and external_event_id = p_external_event_id;
  if found then return v_flight; end if;
  select * into v_aircraft from public.aircraft where id = p_aircraft_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Aircraft was not found in this organization.' using errcode = 'P0002'; end if;
  if v_aircraft.dispatch_status = 'not_dispatchable' then raise exception 'Aircraft unavailable: %', v_aircraft.technical_status; end if;
  if char_length(trim(coalesce(p_payload ->> 'flightReference', ''))) < 2 then raise exception 'Flight reference is required.'; end if;
  insert into public.aircraft_flights (organization_id, aircraft_id, external_event_id, flight_reference, departure_station, arrival_station, off_block_at, on_block_at, block_minutes, airborne_minutes, flight_cycles, source)
  values (p_organization_id, p_aircraft_id, p_external_event_id, upper(trim(p_payload ->> 'flightReference')), nullif(upper(trim(p_payload ->> 'departureStation')), ''), nullif(upper(trim(p_payload ->> 'arrivalStation')), ''), nullif(p_payload ->> 'offBlockAt', '')::timestamptz, coalesce(nullif(p_payload ->> 'onBlockAt', '')::timestamptz, now()), v_block_minutes, nullif(p_payload ->> 'airborneMinutes', '')::integer, v_cycles, coalesce(nullif(p_payload ->> 'source', ''), 'cabin_controls')) returning * into v_flight;
  update public.aircraft set airframe_hours_minutes = airframe_hours_minutes + v_block_minutes, airframe_cycles = airframe_cycles + v_cycles, current_station = coalesce(v_flight.arrival_station, current_station), last_flight_at = v_flight.on_block_at, updated_at = now() where id = p_aircraft_id;
  insert into public.aircraft_log_entries (organization_id, aircraft_id, reference, occurred_at, station, category, description, related_flight_id, entered_by_subject, source)
  values (p_organization_id, p_aircraft_id, 'FLT-' || replace(p_external_event_id::text, '-', ''), v_flight.on_block_at, v_flight.arrival_station, 'flight', 'Flight ' || v_flight.flight_reference || ' completed', v_flight.id, p_actor_subject, v_flight.source);
  insert into public.fleet_audit_events (organization_id, aircraft_id, action, entity_type, entity_id, after_value, reason, actor_subject, actor_role, client_source, request_id)
  values (p_organization_id, p_aircraft_id, 'flight.completed', 'aircraft_flight', v_flight.id, jsonb_build_object('flight_id', v_flight.id, 'reference', v_flight.flight_reference), 'Flight completion ingested', p_actor_subject, p_actor_role, v_flight.source, p_external_event_id);
  return v_flight;
end;
$$;

create or replace function public.fleet_maintenance_due(p_aircraft_id uuid)
returns table (task_id uuid, task_code text, task_name text, due_date date, due_hours_minutes bigint, due_cycles bigint, due_status text, due_reason text)
language sql
stable
as $$
  with aircraft_context as (
    select * from public.aircraft where id = p_aircraft_id
  ), applicable as (
    select mt.* from public.maintenance_tasks mt
    join public.maintenance_programs mp on mp.id = mt.maintenance_program_id and mp.active
    cross join aircraft_context a
    where mt.active and (mp.aircraft_family is null or mp.aircraft_family = a.aircraft_family)
  )
  select t.id, t.code, t.name, t.due_date, t.due_hours_minutes, t.due_cycles,
    case
      when (t.due_date is not null and t.due_date < current_date)
        or (t.due_hours_minutes is not null and a.airframe_hours_minutes >= t.due_hours_minutes)
        or (t.due_cycles is not null and a.airframe_cycles >= t.due_cycles) then 'overdue'
      when (t.due_date is not null and t.due_date <= current_date + t.upcoming_date_days)
        or (t.due_hours_minutes is not null and a.airframe_hours_minutes + t.upcoming_hours_minutes >= t.due_hours_minutes)
        or (t.due_cycles is not null and a.airframe_cycles + t.upcoming_cycles >= t.due_cycles) then 'due_soon'
      else 'normal'
    end,
    concat_ws('; ',
      case when t.due_date is not null then 'Date ' || to_char(t.due_date, 'YYYY-MM-DD') end,
      case when t.due_hours_minutes is not null then 'FH ' || t.due_hours_minutes end,
      case when t.due_cycles is not null then 'FC ' || t.due_cycles end)
  from applicable t cross join aircraft_context a;
$$;

revoke all on function public.fleet_assert_active_member(uuid, text) from public, anon, authenticated;
revoke all on function public.fleet_create_aircraft(uuid, jsonb, text, text, uuid) from public, anon, authenticated;
revoke all on function public.fleet_transition_aircraft_status(uuid, uuid, bigint, text, text, text, text, text, text, text, timestamptz, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.fleet_report_defect(uuid, uuid, jsonb, text, text, uuid) from public, anon, authenticated;
revoke all on function public.fleet_complete_flight(uuid, uuid, uuid, jsonb, text, text) from public, anon, authenticated;
