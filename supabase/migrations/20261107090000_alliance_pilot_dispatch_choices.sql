-- Route provenance and callsign remain immutable; dispatch time and aircraft are pilot choices.
-- Existing bookings and all credit/finance safeguards remain unchanged.
begin;
create or replace function public.bav_alliance_book(p_pilot_id text,p_booking jsonb,p_plan jsonb,p_snapshot jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_state jsonb; v_ops jsonb; v_pilot jsonb; v_schedule jsonb; v_policy jsonb; v_active jsonb; v_id uuid; v_date date;
begin
  select policy into v_policy from alliance_settings where singleton and enabled;
  if v_policy is null then raise exception 'Alliance Operations is not enabled'; end if;
  select data into v_schedule from alliance_schedules where id=p_snapshot#>>'{schedule,id}' for share;
  if v_schedule is null or v_schedule <> p_snapshot->'schedule' or v_policy <> p_snapshot->'policy' then raise exception 'Schedule or policy changed; refresh'; end if;
  v_date := (p_booking->>'date')::date;
  if not coalesce((v_schedule->>'enabled')::boolean,false) or v_date < (v_schedule->>'validFrom')::date or v_date > (v_schedule->>'validUntil')::date then raise exception 'Schedule is not available on this date'; end if;
  if not exists(select 1 from alliance_carriers c join lateral
    (select * from alliance_memberships where carrier_id=c.id and v_date>=valid_from and (valid_until is null or v_date<=valid_until) order by valid_from desc limit 1) m on true
    where c.id=v_schedule->>'operatorId' and c.enabled and m.eligible) then raise exception 'Operating carrier is not eligible'; end if;
  select state into v_state from pilot_state where singleton for update;
  select value into v_pilot from jsonb_array_elements(v_state->'pilots') where value->>'id'=p_pilot_id;
  if v_pilot is null or v_pilot->>'status'='suspended' then raise exception 'Pilot not available'; end if;
  if coalesce(v_pilot#>>'{careerExperience,mode}','career') <> p_snapshot->>'mode' then raise exception 'Career mode changed; refresh'; end if;
  v_ops := coalesce(v_state->'operationsState','{"version":5,"bookings":[],"flightPlans":[],"pireps":[]}'::jsonb);
  if v_ops='null'::jsonb then v_ops := '{"version":5,"bookings":[],"flightPlans":[],"pireps":[]}'::jsonb; end if;
  select value into v_active from jsonb_array_elements(v_ops->'bookings') where value->>'pilotId'=p_pilot_id and value->>'status' in ('booked','in_progress') limit 1;
  if v_active is not null then
    if v_active->>'routeId'=p_booking->>'routeId' and v_active->>'date'=p_booking->>'date' then return (v_active->>'id')::uuid; end if;
    raise exception 'An active flight already exists; finish or cancel it first';
  end if;
  v_id := (p_booking->>'id')::uuid;
  if p_booking->>'pilotId'<>p_pilot_id or p_booking->>'status'<>'booked' or p_plan->>'pilotId'<>p_pilot_id or p_plan->>'bookingId'<>v_id::text
    or p_booking->>'flightNumber'<>v_schedule->>'operatingFlightNumber' or p_booking->>'callsign'<>v_schedule->>'callsign'
    or p_booking->>'from'<>v_schedule->>'origin' or p_booking->>'to'<>v_schedule->>'destination'
    or nullif(btrim(p_booking->>'aircraft'),'') is null or length(p_booking->>'aircraft')>80
    or coalesce(p_booking->>'departure','') !~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'
    or p_booking->>'fleetAircraftId' is not null or p_booking->>'registration' is not null then raise exception 'Invalid booking snapshot'; end if;
  insert into alliance_bookings(booking_id,pilot_id,schedule_id,carrier_id,snapshot,dispatch_approved)
    values(v_id,p_pilot_id,v_schedule->>'id',v_schedule->>'operatorId',p_snapshot,false);
  v_ops := jsonb_set(v_ops,'{bookings}',coalesce(v_ops->'bookings','[]'::jsonb)||jsonb_build_array(p_booking));
  v_ops := jsonb_set(v_ops,'{flightPlans}',coalesce(v_ops->'flightPlans','[]'::jsonb)||jsonb_build_array(p_plan));
  update pilot_state set state=jsonb_set(v_state,'{operationsState}',v_ops) where singleton;
  insert into alliance_audit(actor,action,reference,details) values(p_pilot_id,'booking.created',v_id::text,p_snapshot);
  return v_id;
end $$;
revoke all on function public.bav_alliance_book(text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.bav_alliance_book(text,jsonb,jsonb,jsonb) to service_role;
commit;
