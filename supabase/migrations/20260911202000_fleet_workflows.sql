-- Fleet maintenance, defect, damage and repaint workflows.
-- Every procedure records the operational change alongside its technical-log
-- and audit evidence. Records are transitioned or voided, never deleted.

create or replace function public.fleet_create_maintenance_event(
  p_organization_id uuid,
  p_aircraft_id uuid,
  p_payload jsonb,
  p_actor_subject text,
  p_actor_role text,
  p_request_id uuid
) returns public.maintenance_events
language plpgsql security definer set search_path = public as $$
declare
  v_aircraft public.aircraft;
  v_event public.maintenance_events;
  v_existing_id uuid;
  v_status text := coalesce(nullif(p_payload ->> 'status', ''), 'planned');
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  select * into v_aircraft from public.aircraft where id = p_aircraft_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Aircraft was not found in this organization.' using errcode = 'P0002'; end if;
  select nullif(after_value ->> 'maintenance_event_id', '')::uuid into v_existing_id from public.fleet_audit_events where organization_id = p_organization_id and request_id = p_request_id;
  if v_existing_id is not null then select * into v_event from public.maintenance_events where id = v_existing_id; return v_event; end if;
  if char_length(trim(coalesce(p_payload ->> 'maintenanceType', ''))) < 2 then raise exception 'Maintenance type is required.'; end if;
  if char_length(trim(coalesce(p_payload ->> 'reason', ''))) < 3 then raise exception 'Maintenance reason is required.'; end if;
  if v_status not in ('planned', 'scheduled', 'aircraft_awaited', 'in_progress', 'awaiting_parts', 'awaiting_inspection', 'awaiting_engineering', 'testing') then raise exception 'New maintenance events must be active maintenance states.'; end if;
  insert into public.maintenance_events (organization_id, aircraft_id, reference, maintenance_type, planned_start_at, actual_start_at, estimated_completion_at, location, provider, reason, work_scope, status, blocking)
  values (p_organization_id, p_aircraft_id, 'MX-' || upper(left(replace(p_request_id::text, '-', ''), 10)), trim(p_payload ->> 'maintenanceType'), nullif(p_payload ->> 'plannedStartAt', '')::timestamptz, nullif(p_payload ->> 'actualStartAt', '')::timestamptz, nullif(p_payload ->> 'estimatedCompletionAt', '')::timestamptz, nullif(upper(trim(p_payload ->> 'location')), ''), nullif(trim(p_payload ->> 'provider'), ''), trim(p_payload ->> 'reason'), nullif(trim(p_payload ->> 'workScope'), ''), v_status, coalesce(nullif(p_payload ->> 'blocking', '')::boolean, true)) returning * into v_event;
  if v_event.blocking then
    update public.aircraft set technical_status = case when v_event.status = 'in_progress' then 'in_maintenance' else 'scheduled_maintenance' end, dispatch_status = 'not_dispatchable', status_version = status_version + 1, updated_at = now() where id = p_aircraft_id;
    insert into public.aircraft_status_history (organization_id, aircraft_id, previous_operational_status, operational_status, previous_technical_status, technical_status, previous_dispatch_status, dispatch_status, reason, station, effective_at, source, request_id, changed_by_subject, changed_by_role)
    values (p_organization_id, p_aircraft_id, v_aircraft.operational_status, v_aircraft.operational_status, v_aircraft.technical_status, case when v_event.status = 'in_progress' then 'in_maintenance' else 'scheduled_maintenance' end, v_aircraft.dispatch_status, 'not_dispatchable', 'Blocking maintenance event created: ' || v_event.reference, v_event.location, now(), 'website', gen_random_uuid(), p_actor_subject, p_actor_role);
  end if;
  insert into public.aircraft_log_entries (organization_id, aircraft_id, reference, occurred_at, station, category, description, entered_by_subject, source)
  values (p_organization_id, p_aircraft_id, 'LOG-' || replace(p_request_id::text, '-', ''), now(), v_event.location, 'maintenance', 'Maintenance event ' || v_event.reference || ': ' || v_event.reason, p_actor_subject, 'website');
  insert into public.fleet_audit_events (organization_id, aircraft_id, action, entity_type, entity_id, after_value, reason, actor_subject, actor_role, client_source, request_id)
  values (p_organization_id, p_aircraft_id, 'maintenance.created', 'maintenance_event', v_event.id, jsonb_build_object('maintenance_event_id', v_event.id, 'reference', v_event.reference), v_event.reason, p_actor_subject, p_actor_role, 'website', p_request_id);
  return v_event;
end;
$$;

create or replace function public.fleet_transition_maintenance_event(
  p_organization_id uuid,
  p_event_id uuid,
  p_expected_version bigint,
  p_action text,
  p_notes text,
  p_actor_subject text,
  p_actor_role text,
  p_request_id uuid
) returns public.maintenance_events
language plpgsql security definer set search_path = public as $$
declare
  v_before public.maintenance_events;
  v_after public.maintenance_events;
  v_new_status text;
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  select * into v_before from public.maintenance_events where id = p_event_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Maintenance event was not found in this organization.' using errcode = 'P0002'; end if;
  if v_before.version <> p_expected_version then raise exception 'This maintenance event changed while you were editing it. Refresh and review the newer record.' using errcode = '40001'; end if;
  if char_length(trim(coalesce(p_notes, ''))) < 3 then raise exception 'A work note of at least 3 characters is required.'; end if;
  v_new_status := case p_action when 'start' then 'in_progress' when 'await_parts' then 'awaiting_parts' when 'test' then 'testing' when 'complete' then 'completed' when 'cancel' then 'cancelled' else null end;
  if v_new_status is null then raise exception 'Unsupported maintenance action.'; end if;
  if v_before.status in ('released', 'cancelled') then raise exception 'A completed or cancelled maintenance event cannot be changed.'; end if;
  update public.maintenance_events set status = v_new_status, actual_start_at = case when v_new_status = 'in_progress' and actual_start_at is null then now() else actual_start_at end, actual_completion_at = case when v_new_status = 'completed' then now() else actual_completion_at end, work_scope = concat_ws(E'\n', nullif(work_scope, ''), upper(replace(p_action, '_', ' ')) || ': ' || trim(p_notes)), version = version + 1, updated_at = now() where id = p_event_id returning * into v_after;
  insert into public.aircraft_log_entries (organization_id, aircraft_id, reference, occurred_at, station, category, description, entered_by_subject, source)
  values (p_organization_id, v_after.aircraft_id, 'MX-' || replace(p_request_id::text, '-', ''), now(), v_after.location, 'maintenance', v_after.reference || ' ' || upper(replace(p_action, '_', ' ')) || ': ' || trim(p_notes), p_actor_subject, 'website');
  insert into public.fleet_audit_events (organization_id, aircraft_id, action, entity_type, entity_id, before_value, after_value, reason, actor_subject, actor_role, client_source, request_id)
  values (p_organization_id, v_after.aircraft_id, 'maintenance.' || p_action, 'maintenance_event', v_after.id, to_jsonb(v_before), to_jsonb(v_after), trim(p_notes), p_actor_subject, p_actor_role, 'website', p_request_id);
  return v_after;
end;
$$;

create or replace function public.fleet_transition_defect(
  p_organization_id uuid,
  p_defect_id uuid,
  p_expected_version bigint,
  p_action text,
  p_notes text,
  p_deferral jsonb,
  p_actor_subject text,
  p_actor_role text,
  p_request_id uuid
) returns public.aircraft_defects
language plpgsql security definer set search_path = public as $$
declare
  v_before public.aircraft_defects;
  v_after public.aircraft_defects;
  v_new_status text;
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  select * into v_before from public.aircraft_defects where id = p_defect_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Defect was not found in this organization.' using errcode = 'P0002'; end if;
  if v_before.version <> p_expected_version then raise exception 'This defect changed while you were editing it. Refresh and review the newer record.' using errcode = '40001'; end if;
  if char_length(trim(coalesce(p_notes, ''))) < 3 then raise exception 'A defect action note of at least 3 characters is required.'; end if;
  v_new_status := case p_action when 'review' then 'under_review' when 'defer' then 'deferred' when 'schedule_maintenance' then 'maintenance_scheduled' when 'start_work' then 'work_in_progress' when 'await_parts' then 'awaiting_parts' when 'rectify' then 'rectified' when 'close' then 'closed' when 'void' then 'voided' else null end;
  if v_new_status is null then raise exception 'Unsupported defect action.'; end if;
  if v_before.status in ('closed', 'voided') then raise exception 'A closed or voided defect cannot be changed.'; end if;
  if p_action = 'defer' then
    if coalesce(p_deferral ->> 'kind', '') not in ('mel', 'cdl', 'airline_rule') then raise exception 'A MEL, CDL or airline-rule deferral kind is required.'; end if;
    if char_length(trim(coalesce(p_deferral ->> 'reference', ''))) < 2 or char_length(trim(coalesce(p_deferral ->> 'restriction', ''))) < 3 then raise exception 'Deferral reference and restriction are required.'; end if;
    insert into public.deferred_defects (organization_id, defect_id, deferral_kind, reference, restriction, operational_procedure, maintenance_procedure, deferred_at, due_at, due_cycles, due_hours_minutes, approved_by_subject)
    values (p_organization_id, v_before.id, p_deferral ->> 'kind', upper(trim(p_deferral ->> 'reference')), trim(p_deferral ->> 'restriction'), nullif(trim(p_deferral ->> 'operationalProcedure'), ''), nullif(trim(p_deferral ->> 'maintenanceProcedure'), ''), now(), nullif(p_deferral ->> 'dueAt', '')::timestamptz, nullif(p_deferral ->> 'dueCycles', '')::bigint, nullif(p_deferral ->> 'dueHoursMinutes', '')::bigint, p_actor_subject);
  end if;
  update public.aircraft_defects set status = v_new_status, rectification_action = case when p_action in ('rectify', 'close') then trim(p_notes) else rectification_action end, closed_at = case when p_action = 'close' then now() else closed_at end, closed_by_subject = case when p_action = 'close' then p_actor_subject else closed_by_subject end, version = version + 1, updated_at = now() where id = p_defect_id returning * into v_after;
  insert into public.aircraft_defect_actions (organization_id, defect_id, action_type, details, station, performed_at, performed_by_subject, request_id)
  values (p_organization_id, v_after.id, case when p_action = 'review' then 'reviewed' when p_action = 'defer' then 'deferred' when p_action = 'start_work' then 'work_started' when p_action = 'await_parts' then 'parts_requested' when p_action = 'rectify' then 'rectified' when p_action = 'close' then 'closed' else 'assigned' end, trim(p_notes), v_after.reporting_station, now(), p_actor_subject, p_request_id);
  insert into public.aircraft_log_entries (organization_id, aircraft_id, reference, occurred_at, station, category, description, related_defect_id, entered_by_subject, source)
  values (p_organization_id, v_after.aircraft_id, 'DEF-' || replace(p_request_id::text, '-', ''), now(), v_after.reporting_station, case when p_action = 'defer' then 'deferred_defect' when p_action in ('rectify', 'close') then 'rectification' else 'defect' end, v_after.reference || ' ' || upper(replace(p_action, '_', ' ')) || ': ' || trim(p_notes), v_after.id, p_actor_subject, 'website');
  insert into public.fleet_audit_events (organization_id, aircraft_id, action, entity_type, entity_id, before_value, after_value, reason, actor_subject, actor_role, client_source, request_id)
  values (p_organization_id, v_after.aircraft_id, 'defect.' || p_action, 'aircraft_defect', v_after.id, to_jsonb(v_before), to_jsonb(v_after), trim(p_notes), p_actor_subject, p_actor_role, 'website', p_request_id);
  return v_after;
end;
$$;

create or replace function public.fleet_report_damage(
  p_organization_id uuid,
  p_aircraft_id uuid,
  p_payload jsonb,
  p_actor_subject text,
  p_actor_role text,
  p_request_id uuid
) returns public.aircraft_damage_records
language plpgsql security definer set search_path = public as $$
declare
  v_aircraft public.aircraft;
  v_damage public.aircraft_damage_records;
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  select * into v_aircraft from public.aircraft where id = p_aircraft_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Aircraft was not found in this organization.' using errcode = 'P0002'; end if;
  if char_length(trim(coalesce(p_payload ->> 'location', ''))) < 2 or char_length(trim(coalesce(p_payload ->> 'damageType', ''))) < 2 or char_length(trim(coalesce(p_payload ->> 'description', ''))) < 3 then raise exception 'Damage location, type and description are required.'; end if;
  if coalesce(p_payload ->> 'severity', 'minor') not in ('minor', 'major', 'critical') then raise exception 'Invalid damage severity.'; end if;
  insert into public.aircraft_damage_records (organization_id, aircraft_id, reference, reported_at, station, reporter_subject, location, damage_type, description, severity, inspection_required, operational_restriction, repair_required, status)
  values (p_organization_id, p_aircraft_id, 'DMG-' || upper(left(replace(p_request_id::text, '-', ''), 10)), coalesce(nullif(p_payload ->> 'reportedAt', '')::timestamptz, now()), nullif(upper(trim(p_payload ->> 'station')), ''), p_actor_subject, trim(p_payload ->> 'location'), trim(p_payload ->> 'damageType'), trim(p_payload ->> 'description'), coalesce(p_payload ->> 'severity', 'minor'), coalesce(nullif(p_payload ->> 'inspectionRequired', '')::boolean, true), nullif(trim(p_payload ->> 'operationalRestriction'), ''), coalesce(nullif(p_payload ->> 'repairRequired', '')::boolean, false), case when coalesce(nullif(p_payload ->> 'inspectionRequired', '')::boolean, true) then 'awaiting_inspection' else 'reported' end) returning * into v_damage;
  if v_damage.severity = 'critical' then
    update public.aircraft set technical_status = 'damage_inspection', dispatch_status = 'not_dispatchable', status_version = status_version + 1, updated_at = now() where id = p_aircraft_id;
    insert into public.aircraft_status_history (organization_id, aircraft_id, previous_operational_status, operational_status, previous_technical_status, technical_status, previous_dispatch_status, dispatch_status, reason, station, effective_at, source, request_id, changed_by_subject, changed_by_role)
    values (p_organization_id, p_aircraft_id, v_aircraft.operational_status, v_aircraft.operational_status, v_aircraft.technical_status, 'damage_inspection', v_aircraft.dispatch_status, 'not_dispatchable', 'Critical damage reported: ' || v_damage.reference, v_damage.station, now(), 'website', gen_random_uuid(), p_actor_subject, p_actor_role);
  end if;
  insert into public.aircraft_log_entries (organization_id, aircraft_id, reference, occurred_at, station, category, description, entered_by_subject, source)
  values (p_organization_id, p_aircraft_id, 'DMG-' || replace(p_request_id::text, '-', ''), v_damage.reported_at, v_damage.station, 'damage', 'Damage ' || v_damage.reference || ': ' || v_damage.description, p_actor_subject, 'website');
  insert into public.fleet_audit_events (organization_id, aircraft_id, action, entity_type, entity_id, after_value, reason, actor_subject, actor_role, client_source, request_id)
  values (p_organization_id, p_aircraft_id, 'damage.reported', 'aircraft_damage', v_damage.id, jsonb_build_object('damage_id', v_damage.id, 'reference', v_damage.reference), v_damage.description, p_actor_subject, p_actor_role, 'website', p_request_id);
  return v_damage;
end;
$$;

create or replace function public.fleet_start_repaint(
  p_organization_id uuid,
  p_aircraft_id uuid,
  p_payload jsonb,
  p_actor_subject text,
  p_actor_role text,
  p_request_id uuid
) returns public.aircraft_repaints
language plpgsql security definer set search_path = public as $$
declare
  v_aircraft public.aircraft;
  v_repaint public.aircraft_repaints;
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  select * into v_aircraft from public.aircraft where id = p_aircraft_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Aircraft was not found in this organization.' using errcode = 'P0002'; end if;
  if char_length(trim(coalesce(p_payload ->> 'newLivery', ''))) < 2 then raise exception 'New livery is required.'; end if;
  insert into public.aircraft_repaints (organization_id, aircraft_id, reference, current_livery, new_livery, paint_facility, reason, planned_start_at, actual_start_at, estimated_completion_at, status, notes)
  values (p_organization_id, p_aircraft_id, 'RPT-' || upper(left(replace(p_request_id::text, '-', ''), 10)), v_aircraft.current_livery, trim(p_payload ->> 'newLivery'), nullif(trim(p_payload ->> 'paintFacility'), ''), nullif(trim(p_payload ->> 'reason'), ''), nullif(p_payload ->> 'plannedStartAt', '')::timestamptz, now(), nullif(p_payload ->> 'estimatedCompletionAt', '')::timestamptz, 'in_repaint', nullif(trim(p_payload ->> 'notes'), '')) returning * into v_repaint;
  update public.aircraft set technical_status = 'repaint', dispatch_status = 'not_dispatchable', status_version = status_version + 1, updated_at = now() where id = p_aircraft_id;
  insert into public.aircraft_status_history (organization_id, aircraft_id, previous_operational_status, operational_status, previous_technical_status, technical_status, previous_dispatch_status, dispatch_status, reason, station, effective_at, source, request_id, changed_by_subject, changed_by_role)
  values (p_organization_id, p_aircraft_id, v_aircraft.operational_status, v_aircraft.operational_status, v_aircraft.technical_status, 'repaint', v_aircraft.dispatch_status, 'not_dispatchable', 'Repaint started: ' || v_repaint.reference, v_repaint.paint_facility, now(), 'website', gen_random_uuid(), p_actor_subject, p_actor_role);
  insert into public.aircraft_log_entries (organization_id, aircraft_id, reference, occurred_at, station, category, description, entered_by_subject, source)
  values (p_organization_id, p_aircraft_id, 'RPT-' || replace(p_request_id::text, '-', ''), now(), v_repaint.paint_facility, 'repaint', 'Repaint started: ' || v_repaint.new_livery, p_actor_subject, 'website');
  insert into public.fleet_audit_events (organization_id, aircraft_id, action, entity_type, entity_id, after_value, reason, actor_subject, actor_role, client_source, request_id)
  values (p_organization_id, p_aircraft_id, 'repaint.started', 'aircraft_repaint', v_repaint.id, jsonb_build_object('repaint_id', v_repaint.id, 'reference', v_repaint.reference), coalesce(v_repaint.reason, 'Repaint started'), p_actor_subject, p_actor_role, 'website', p_request_id);
  return v_repaint;
end;
$$;

revoke all on function public.fleet_create_maintenance_event(uuid, uuid, jsonb, text, text, uuid) from public, anon, authenticated;
revoke all on function public.fleet_transition_maintenance_event(uuid, uuid, bigint, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.fleet_transition_defect(uuid, uuid, bigint, text, text, jsonb, text, text, uuid) from public, anon, authenticated;
revoke all on function public.fleet_report_damage(uuid, uuid, jsonb, text, text, uuid) from public, anon, authenticated;
revoke all on function public.fleet_start_repaint(uuid, uuid, jsonb, text, text, uuid) from public, anon, authenticated;
