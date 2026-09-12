-- Repair the canonical action-history values emitted by the defect transition workflow.
-- `aircraft_defect_actions.action_type` correctly accepts `rectified` and `closed`;
-- the original workflow mistakenly emitted `rectify` and `close`.

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

revoke all on function public.fleet_transition_defect(uuid, uuid, bigint, text, text, jsonb, text, text, uuid) from public, anon, authenticated;
