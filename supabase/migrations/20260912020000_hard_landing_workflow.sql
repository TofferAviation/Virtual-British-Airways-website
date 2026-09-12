-- Automatic hard-landing assessment from FreeFlight Cabin Controls.
--
-- -500 to -599 fpm: mandatory visual inspection before the next dispatch.
-- -600 fpm or harder: blocking maintenance event until engineering release.
-- The whole outcome is committed as one auditable database transaction.

create or replace function public.fleet_record_hard_landing(
  p_organization_id uuid,
  p_aircraft_id uuid,
  p_landing_fpm integer,
  p_station text,
  p_actor_subject text,
  p_actor_role text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aircraft public.aircraft;
  v_damage public.aircraft_damage_records;
  v_maintenance public.maintenance_events;
  v_existing jsonb;
  v_maintenance_required boolean := p_landing_fpm <= -600;
  v_station text := nullif(upper(trim(coalesce(p_station, ''))), '');
  v_outcome text;
  v_reference text;
  v_reason text;
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  if p_request_id is null then raise exception 'Request ID is required.'; end if;
  if p_landing_fpm > -500 then raise exception 'Hard-landing assessment requires a touchdown rate of -500 fpm or lower.'; end if;

  select after_value into v_existing
  from public.fleet_audit_events
  where organization_id = p_organization_id and request_id = p_request_id;
  if v_existing is not null then return v_existing; end if;

  select * into v_aircraft
  from public.aircraft
  where id = p_aircraft_id and organization_id = p_organization_id
  for update;
  if not found then raise exception 'Aircraft was not found in this organization.' using errcode = 'P0002'; end if;

  v_outcome := case when v_maintenance_required then 'maintenance_required' else 'inspection_required' end;
  v_reason := case
    when v_maintenance_required then format('Hard landing recorded at %s fpm. Aircraft routed to maintenance pending engineering release.', p_landing_fpm)
    else format('Hard landing recorded at %s fpm. Mandatory visual inspection required before next dispatch.', p_landing_fpm)
  end;

  insert into public.aircraft_damage_records (
    organization_id, aircraft_id, reference, reported_at, station, reporter_subject,
    location, damage_type, description, severity, inspection_required,
    operational_restriction, repair_required, status
  ) values (
    p_organization_id, p_aircraft_id, 'LDG-' || upper(left(replace(p_request_id::text, '-', ''), 10)), now(),
    coalesce(v_station, v_aircraft.current_station), p_actor_subject,
    'Landing gear / airframe', 'Hard landing', v_reason,
    case when v_maintenance_required then 'critical' else 'major' end, true,
    case when v_maintenance_required then 'Aircraft held for maintenance and engineering release.' else 'Visual inspection and maintenance sign-off required before dispatch.' end,
    v_maintenance_required, case when v_maintenance_required then 'repair_required' else 'awaiting_inspection' end
  ) returning * into v_damage;

  if v_maintenance_required then
    insert into public.maintenance_events (
      organization_id, aircraft_id, reference, maintenance_type, location, reason, work_scope, status, blocking
    ) values (
      p_organization_id, p_aircraft_id, 'MX-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)),
      'Hard landing inspection', coalesce(v_station, v_aircraft.current_station), v_reason,
      'Inspect landing gear, airframe and attached systems after a hard landing. Engineering release is required before dispatch.',
      'aircraft_awaited', true
    ) returning * into v_maintenance;
  end if;

  update public.aircraft set
    technical_status = case when v_maintenance_required then 'scheduled_maintenance' else 'inspection_required' end,
    dispatch_status = 'not_dispatchable',
    current_station = coalesce(v_station, current_station),
    status_version = status_version + 1,
    updated_at = now()
  where id = p_aircraft_id;

  insert into public.aircraft_status_history (
    organization_id, aircraft_id, previous_operational_status, operational_status,
    previous_technical_status, technical_status, previous_dispatch_status, dispatch_status,
    reason, remarks, station, effective_at, source, request_id, changed_by_subject, changed_by_role
  ) values (
    p_organization_id, p_aircraft_id, v_aircraft.operational_status, v_aircraft.operational_status,
    v_aircraft.technical_status, case when v_maintenance_required then 'scheduled_maintenance' else 'inspection_required' end,
    v_aircraft.dispatch_status, 'not_dispatchable', v_reason, 'Touchdown rate: ' || p_landing_fpm || ' fpm',
    coalesce(v_station, v_aircraft.current_station), now(), 'cabin_controls', p_request_id, p_actor_subject, p_actor_role
  );

  insert into public.aircraft_log_entries (
    organization_id, aircraft_id, reference, occurred_at, station, category, description,
    related_damage_id, entered_by_subject, source
  ) values (
    p_organization_id, p_aircraft_id, v_damage.reference, now(), coalesce(v_station, v_aircraft.current_station),
    'hard_landing', v_reason, v_damage.id, p_actor_subject, 'cabin_controls'
  );

  v_reference := coalesce(v_maintenance.reference, v_damage.reference);
  v_existing := jsonb_build_object(
    'outcome', v_outcome,
    'landing_fpm', p_landing_fpm,
    'registration', v_aircraft.registration,
    'reference', v_reference,
    'damage_reference', v_damage.reference,
    'maintenance_reference', case when v_maintenance.id is null then null else v_maintenance.reference end
  );

  insert into public.fleet_audit_events (
    organization_id, aircraft_id, action, entity_type, entity_id, after_value, reason,
    actor_subject, actor_role, client_source, request_id
  ) values (
    p_organization_id, p_aircraft_id, 'aircraft.hard_landing_assessed', 'aircraft_damage', v_damage.id, v_existing, v_reason,
    p_actor_subject, p_actor_role, 'cabin_controls', p_request_id
  );

  insert into public.fleet_notifications (organization_id, aircraft_id, kind, severity, title, body, recipient_role)
  values (
    p_organization_id, p_aircraft_id, 'hard_landing', case when v_maintenance_required then 'critical' else 'warning' end,
    case when v_maintenance_required then 'Hard landing — maintenance hold: ' else 'Hard landing — inspection required: ' end || v_aircraft.registration,
    v_reason, 'maintenance_controller'
  );

  return v_existing;
end;
$$;

revoke all on function public.fleet_record_hard_landing(uuid, uuid, integer, text, text, text, uuid) from public, anon, authenticated;
