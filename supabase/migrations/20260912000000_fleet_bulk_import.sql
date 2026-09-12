-- Controlled, atomic fleet onboarding.
--
-- The source workbook is parsed in the staff browser, but this command owns
-- validation and writes the complete batch in one database transaction. It
-- never guesses missing technical or utilization data.

create or replace function public.fleet_import_aircraft(
  p_organization_id uuid,
  p_rows jsonb,
  p_source_label text,
  p_actor_subject text,
  p_actor_role text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_aircraft public.aircraft;
  v_registration text;
  v_model text;
  v_source_status text;
  v_operational_status text;
  v_dispatch_status text;
  v_row_request_id uuid;
  v_imported integer := 0;
  v_stored integer := 0;
  v_result jsonb;
  v_conflicts text;
begin
  perform public.fleet_assert_active_member(p_organization_id, p_actor_subject);
  if p_request_id is null then raise exception 'Import request ID is required.'; end if;
  if char_length(trim(coalesce(p_source_label, ''))) < 3 then raise exception 'Import source label is required.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Import must contain at least one aircraft.'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'A single import is limited to 500 aircraft.'; end if;

  select after_value into v_result
  from public.fleet_audit_events
  where organization_id = p_organization_id
    and request_id = p_request_id
    and action = 'fleet.imported';
  if found then return v_result; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    where upper(trim(coalesce(item.value ->> 'registration', ''))) !~ '^[A-Z0-9-]{2,16}$'
       or char_length(trim(coalesce(item.value ->> 'aircraftModel', ''))) < 2
       or lower(trim(coalesce(item.value ->> 'sourceStatus', ''))) not in ('active', 'stored')
  ) then
    raise exception 'Every imported row needs a valid registration, aircraft model, and Active or Stored source status.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    group by upper(trim(item.value ->> 'registration'))
    having count(*) > 1
  ) then
    raise exception 'The import contains duplicate registrations.';
  end if;

  select string_agg(a.registration, ', ' order by a.registration) into v_conflicts
  from public.aircraft a
  join jsonb_array_elements(p_rows) as item(value)
    on a.registration = upper(trim(item.value ->> 'registration'))
  where a.organization_id = p_organization_id;
  if v_conflicts is not null then
    raise exception 'The import contains registrations already in the fleet: %', v_conflicts;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_registration := upper(trim(v_row ->> 'registration'));
    v_model := trim(v_row ->> 'aircraftModel');
    v_source_status := lower(trim(v_row ->> 'sourceStatus'));
    v_operational_status := case when v_source_status = 'stored' then 'storage' else 'available' end;
    v_dispatch_status := case when v_source_status = 'stored' then 'not_dispatchable' else 'dispatchable' end;
    v_row_request_id := gen_random_uuid();

    insert into public.aircraft (
      organization_id, registration, fleet_number, manufacturer, aircraft_model,
      aircraft_family, icao_type, operator_name, owner_name, subfleet,
      operational_status, technical_status, dispatch_status
    ) values (
      p_organization_id,
      v_registration,
      nullif(trim(v_row ->> 'fleetNumber'), ''),
      nullif(trim(v_row ->> 'manufacturer'), ''),
      v_model,
      nullif(trim(v_row ->> 'aircraftFamily'), ''),
      nullif(upper(trim(v_row ->> 'icaoType')), ''),
      nullif(trim(v_row ->> 'operatorName'), ''),
      nullif(trim(v_row ->> 'ownerName'), ''),
      nullif(trim(v_row ->> 'subfleet'), ''),
      v_operational_status,
      'serviceable',
      v_dispatch_status
    ) returning * into v_aircraft;

    insert into public.aircraft_status_history (
      organization_id, aircraft_id, operational_status, technical_status, dispatch_status,
      reason, remarks, station, effective_at, source, request_id, changed_by_subject, changed_by_role
    ) values (
      p_organization_id, v_aircraft.id, v_operational_status, 'serviceable', v_dispatch_status,
      'Aircraft master record imported', 'Source: ' || trim(p_source_label), null, now(), 'import',
      v_row_request_id, p_actor_subject, p_actor_role
    );

    insert into public.aircraft_log_entries (
      organization_id, aircraft_id, reference, occurred_at, category, description, entered_by_subject, source
    ) values (
      p_organization_id, v_aircraft.id, 'IMPORT-' || replace(v_row_request_id::text, '-', ''), now(), 'system',
      'Aircraft master record imported from ' || trim(p_source_label), p_actor_subject, 'system'
    );

    insert into public.fleet_audit_events (
      organization_id, aircraft_id, action, entity_type, entity_id, after_value, reason,
      actor_subject, actor_role, client_source, request_id
    ) values (
      p_organization_id, v_aircraft.id, 'aircraft.imported', 'aircraft', v_aircraft.id,
      jsonb_build_object('aircraft_id', v_aircraft.id, 'registration', v_aircraft.registration, 'source_status', v_source_status),
      'Aircraft master record imported from ' || trim(p_source_label), p_actor_subject, p_actor_role, 'import', v_row_request_id
    );

    v_imported := v_imported + 1;
    if v_source_status = 'stored' then v_stored := v_stored + 1; end if;
  end loop;

  v_result := jsonb_build_object(
    'imported', v_imported,
    'active', v_imported - v_stored,
    'stored', v_stored,
    'sourceLabel', trim(p_source_label)
  );
  insert into public.fleet_audit_events (
    organization_id, action, entity_type, after_value, reason,
    actor_subject, actor_role, client_source, request_id
  ) values (
    p_organization_id, 'fleet.imported', 'fleet', v_result,
    'Atomic fleet import from ' || trim(p_source_label), p_actor_subject, p_actor_role, 'import', p_request_id
  );
  return v_result;
end;
$$;

revoke all on function public.fleet_import_aircraft(uuid, jsonb, text, text, text, uuid) from public, anon, authenticated;
