-- Controlled aircraft-position changes for Fleet Management.
--
-- A relocation only updates the parked station. It never changes technical
-- condition, utilization or flight history, and it refuses an airframe with a
-- reservation or an active operational movement.

create or replace function public.fleet_relocate_aircraft(
  p_organization_id uuid,
  p_aircraft_id uuid,
  p_expected_version bigint,
  p_station text,
  p_reason text,
  p_actor_subject text,
  p_actor_role text,
  p_request_id uuid
) returns public.aircraft
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.aircraft;
  v_after public.aircraft;
  v_station text := upper(trim(coalesce(p_station, '')));
  v_reason text := trim(coalesce(p_reason, ''));
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  if p_request_id is null then raise exception 'Request ID is required.'; end if;
  if v_station !~ '^[A-Z0-9]{3,8}$' then raise exception 'Destination station must contain 3–8 letters or numbers.'; end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 1800 then raise exception 'A relocation reason between 3 and 1,800 characters is required.'; end if;

  -- A repeated request returns the original completed command instead of
  -- writing duplicate operational-history entries.
  select a.* into v_after
  from public.fleet_audit_events e
  join public.aircraft a on a.id = e.aircraft_id and a.organization_id = e.organization_id
  where e.organization_id = p_organization_id
    and e.request_id = p_request_id
    and e.action = 'aircraft.relocated'
  limit 1;
  if found then return v_after; end if;

  select * into v_before
  from public.aircraft
  where id = p_aircraft_id and organization_id = p_organization_id
  for update;
  if not found then raise exception 'Aircraft was not found in this organization.' using errcode = 'P0002'; end if;
  if v_before.status_version <> p_expected_version then
    raise exception 'This aircraft changed while you were preparing the relocation. Refresh and review the newer record.' using errcode = '40001';
  end if;
  if v_before.current_station is not distinct from v_station then
    raise exception '% is already recorded at %.', v_before.registration, v_station;
  end if;
  if v_before.operational_status in ('scheduled', 'assigned', 'in_service', 'turnaround', 'ferry', 'positioning')
    or exists (
      select 1 from public.aircraft_flight_assignments assignment
      where assignment.organization_id = p_organization_id
        and assignment.aircraft_id = v_before.id
        and assignment.status in ('reserved', 'operating')
    ) then
    raise exception '% has a reservation or active operation and cannot be relocated.', v_before.registration;
  end if;

  update public.aircraft
  set current_station = v_station,
      status_version = status_version + 1,
      updated_at = now()
  where id = v_before.id
  returning * into v_after;

  insert into public.aircraft_status_history (
    organization_id, aircraft_id, previous_operational_status, operational_status,
    previous_technical_status, technical_status, previous_dispatch_status, dispatch_status,
    reason, station, effective_at, source, request_id, changed_by_subject, changed_by_role
  ) values (
    p_organization_id, v_after.id, v_before.operational_status, v_after.operational_status,
    v_before.technical_status, v_after.technical_status, v_before.dispatch_status, v_after.dispatch_status,
    'Aircraft relocated: ' || v_reason, v_station, now(), 'website', p_request_id, p_actor_subject, p_actor_role
  );
  insert into public.aircraft_log_entries (
    organization_id, aircraft_id, reference, occurred_at, station, category, description, entered_by_subject, source
  ) values (
    p_organization_id, v_after.id, 'RELOC-' || replace(p_request_id::text, '-', ''), now(), v_station, 'status',
    'Aircraft station relocated from ' || coalesce(v_before.current_station, 'unassigned') || ' to ' || v_station || ': ' || v_reason,
    p_actor_subject, 'website'
  );
  insert into public.fleet_audit_events (
    organization_id, aircraft_id, action, entity_type, entity_id, before_value, after_value, reason,
    actor_subject, actor_role, client_source, request_id
  ) values (
    p_organization_id, v_after.id, 'aircraft.relocated', 'aircraft', v_after.id, to_jsonb(v_before), to_jsonb(v_after), v_reason,
    p_actor_subject, p_actor_role, 'website', p_request_id
  );
  return v_after;
end;
$$;

create or replace function public.fleet_relocate_eligible_fleet(
  p_organization_id uuid,
  p_station text,
  p_reason text,
  p_actor_subject text,
  p_actor_role text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.aircraft;
  v_after public.aircraft;
  v_station text := upper(trim(coalesce(p_station, '')));
  v_reason text := trim(coalesce(p_reason, ''));
  v_relocated integer := 0;
  v_skipped_active integer := 0;
  v_already_at_station integer := 0;
  v_result jsonb;
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  if p_request_id is null then raise exception 'Request ID is required.'; end if;
  if v_station !~ '^[A-Z0-9]{3,8}$' then raise exception 'Destination station must contain 3–8 letters or numbers.'; end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 1800 then raise exception 'A relocation reason between 3 and 1,800 characters is required.'; end if;

  select after_value into v_result
  from public.fleet_audit_events
  where organization_id = p_organization_id
    and request_id = p_request_id
    and action = 'fleet.relocated'
  limit 1;
  if found then return v_result; end if;

  for v_before in
    select * from public.aircraft
    where organization_id = p_organization_id
    order by registration
    for update
  loop
    if v_before.current_station is not distinct from v_station then
      v_already_at_station := v_already_at_station + 1;
    elsif v_before.operational_status in ('scheduled', 'assigned', 'in_service', 'turnaround', 'ferry', 'positioning')
      or exists (
        select 1 from public.aircraft_flight_assignments assignment
        where assignment.organization_id = p_organization_id
          and assignment.aircraft_id = v_before.id
          and assignment.status in ('reserved', 'operating')
      ) then
      v_skipped_active := v_skipped_active + 1;
    else
      update public.aircraft
      set current_station = v_station,
          status_version = status_version + 1,
          updated_at = now()
      where id = v_before.id
      returning * into v_after;

      insert into public.aircraft_status_history (
        organization_id, aircraft_id, previous_operational_status, operational_status,
        previous_technical_status, technical_status, previous_dispatch_status, dispatch_status,
        reason, station, effective_at, source, request_id, changed_by_subject, changed_by_role
      ) values (
        p_organization_id, v_after.id, v_before.operational_status, v_after.operational_status,
        v_before.technical_status, v_after.technical_status, v_before.dispatch_status, v_after.dispatch_status,
        'Fleet relocation: ' || v_reason, v_station, now(), 'website', gen_random_uuid(), p_actor_subject, p_actor_role
      );
      insert into public.aircraft_log_entries (
        organization_id, aircraft_id, reference, occurred_at, station, category, description, entered_by_subject, source
      ) values (
        p_organization_id, v_after.id,
        'FLEET-RELOC-' || replace(p_request_id::text, '-', '') || '-' || replace(v_after.registration, '-', ''),
        now(), v_station, 'status',
        'Fleet station relocated from ' || coalesce(v_before.current_station, 'unassigned') || ' to ' || v_station || ': ' || v_reason,
        p_actor_subject, 'website'
      );
      v_relocated := v_relocated + 1;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'relocated', v_relocated,
    'skippedActive', v_skipped_active,
    'alreadyAtStation', v_already_at_station
  );
  insert into public.fleet_audit_events (
    organization_id, aircraft_id, action, entity_type, entity_id, after_value, reason,
    actor_subject, actor_role, client_source, request_id
  ) values (
    p_organization_id, null, 'fleet.relocated', 'fleet', null, v_result, v_reason,
    p_actor_subject, p_actor_role, 'website', p_request_id
  );
  return v_result;
end;
$$;

revoke all on function public.fleet_relocate_aircraft(uuid, uuid, bigint, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.fleet_relocate_eligible_fleet(uuid, text, text, text, text, uuid) from public, anon, authenticated;
