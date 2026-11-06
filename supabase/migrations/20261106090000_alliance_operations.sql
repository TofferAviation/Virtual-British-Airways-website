-- Additive rollout. No historic hours are reset, guessed or re-credited.
begin;
alter table public.pilot_pireps alter column block_minutes type numeric(12,4);
create or replace function public.bav_compare_swap_pilot_state(p_expected jsonb,p_next jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update pilot_state set state=p_next where singleton and state=p_expected;
  return found;
end $$;
revoke all on function public.bav_compare_swap_pilot_state(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.bav_compare_swap_pilot_state(jsonb,jsonb) to service_role;

create table if not exists public.alliance_settings (
  singleton boolean primary key default true check(singleton), enabled boolean not null default false,
  policy jsonb not null, updated_at timestamptz not null default now()
);
insert into public.alliance_settings(singleton, policy) values(true,
  '{"version":"alliance-v1","career":true,"salary":true,"points":true,"tierPoints":true,"rank":true,"requireDispatchApproval":false,"milestones":[36000,180000,360000],"xpPerHour":100}'::jsonb)
on conflict(singleton) do nothing;
create table if not exists public.alliance_carriers (
  id text primary key, name text not null, iata text not null unique check(iata ~ '^[A-Z0-9]{2}$'),
  icao text not null unique check(icao ~ '^[A-Z]{3}$'), parent_id text references public.alliance_carriers(id),
  enabled boolean not null default true, source_url text not null, verified_at timestamptz not null default now()
);
create table if not exists public.alliance_memberships (
  id uuid primary key default gen_random_uuid(), carrier_id text not null references public.alliance_carriers(id),
  valid_from date not null, valid_until date, eligible boolean not null default true,
  kind text not null check(kind in ('member','affiliate')), source_url text not null,
  check(valid_until is null or valid_until >= valid_from), unique(carrier_id, valid_from)
);
-- These are configuration identities, not flight schedules or branding licences.
insert into public.alliance_carriers(id,name,iata,icao,source_url) values
('BA','British Airways','BA','BAW','https://www.oneworld.com/members/british-airways'),
('AA','American Airlines','AA','AAL','https://www.oneworld.com/members/american-airlines'),
('AS','Alaska Airlines','AS','ASA','https://www.oneworld.com/members/alaska-airlines'),
('HA','Hawaiian Airlines','HA','HAL','https://www.oneworld.com/news/oneworld-welcomes-hawaiian-airlines'),
('IB','Iberia','IB','IBE','https://www.oneworld.com/members/iberia'),
('AY','Finnair','AY','FIN','https://www.oneworld.com/members/finnair'),
('QR','Qatar Airways','QR','QTR','https://www.oneworld.com/members/qatar-airways'),
('QF','Qantas','QF','QFA','https://www.oneworld.com/members/qantas'),
('CX','Cathay Pacific','CX','CPA','https://www.oneworld.com/members/cathay-pacific'),
('JL','Japan Airlines','JL','JAL','https://www.oneworld.com/members/japan-airlines'),
('MH','Malaysia Airlines','MH','MAS','https://www.oneworld.com/members/malaysia-airlines'),
('AT','Royal Air Maroc','AT','RAM','https://www.oneworld.com/members/royal-air-maroc'),
('RJ','Royal Jordanian','RJ','RJA','https://www.oneworld.com/members/royal-jordanian'),
('UL','SriLankan Airlines','UL','ALK','https://www.oneworld.com/members/srilankan-airlines'),
('FJ','Fiji Airways','FJ','FJI','https://www.oneworld.com/members/fiji-airways'),
('WY','Oman Air','WY','OMA','https://www.oneworld.com/members/oman-air')
on conflict(id) do nothing;
-- Eligibility in this virtual programme begins at launch; not a claim about
-- the historic real-world joining date. Historic flights require explicit policy.
insert into public.alliance_memberships(carrier_id,valid_from,kind,source_url)
select id,'2026-11-06','member',source_url from public.alliance_carriers where parent_id is null
on conflict(carrier_id,valid_from) do nothing;

create table if not exists public.alliance_schedules (
  id text primary key, operator_id text not null references public.alliance_carriers(id),
  marketing_carrier_id text not null references public.alliance_carriers(id), data jsonb not null,
  updated_at timestamptz not null default now(), updated_by text not null
);
create table if not exists public.alliance_bookings (
  booking_id uuid primary key, pilot_id text not null, schedule_id text not null references public.alliance_schedules(id),
  carrier_id text not null references public.alliance_carriers(id), snapshot jsonb not null,
  dispatch_approved boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists alliance_bookings_pilot_idx on public.alliance_bookings(pilot_id);
alter table public.pilot_pireps add column if not exists alliance_booking_id uuid references public.alliance_bookings(booking_id) on delete restrict;
create unique index if not exists pilot_pireps_alliance_booking_once on public.pilot_pireps(alliance_booking_id) where alliance_booking_id is not null;
create table if not exists public.alliance_credit_ledger (
  id uuid primary key default gen_random_uuid(), pirep_id uuid not null references public.pilot_pireps(id) on delete restrict,
  pilot_id text not null, carrier_id text not null references public.alliance_carriers(id), revision integer not null check(revision>0),
  kind text not null check(kind in ('approval','reversal','adjustment')),
  seconds integer not null, career_seconds integer not null, sectors integer not null check(sectors between -1 and 1),
  distance_nm integer not null, points numeric not null, tier_points numeric not null, salary numeric(12,2) not null, xp integer not null default 0,
  policy jsonb not null, flight jsonb not null, reason text not null check(length(reason) between 3 and 2000),
  actor text not null, created_at timestamptz not null default now(), unique(pirep_id, revision)
);
create unique index if not exists alliance_credit_approval_once on public.alliance_credit_ledger(pirep_id) where kind='approval';
create unique index if not exists alliance_credit_reversal_once on public.alliance_credit_ledger(pirep_id) where kind='reversal';
create index if not exists alliance_credit_pilot_idx on public.alliance_credit_ledger(pilot_id,created_at desc);
create table if not exists public.alliance_audit (
  id uuid primary key default gen_random_uuid(), actor text not null, action text not null,
  reference text not null, details jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.alliance_exports (
  id uuid primary key default gen_random_uuid(), pilot_id text not null, format text not null check(format in ('json','csv')),
  entry_count integer not null, payload_sha256 text not null, created_at timestamptz not null default now()
);
-- A reversal never removes the existing non-negative finance safeguards.
-- Already-spent virtual pay is withheld from subsequent alliance pay instead.
create table if not exists public.alliance_salary_withholdings (
  pilot_id text primary key, remaining numeric(12,2) not null default 0 check(remaining>=0),
  updated_at timestamptz not null default now()
);
create table if not exists public.alliance_salary_adjustments (
  id uuid primary key default gen_random_uuid(), pirep_id uuid not null references public.pilot_pireps(id),
  revision integer not null, pilot_id text not null, requested numeric(12,2) not null,
  deposited numeric(12,2) not null, withheld_before numeric(12,2) not null check(withheld_before>=0),
  withheld_after numeric(12,2) not null check(withheld_after>=0), created_at timestamptz not null default now(),
  unique(pirep_id,revision)
);
-- Banks/milestones are ledger projections. Recalculation cannot invent credit.
create or replace view public.alliance_airline_banks as
select pilot_id,carrier_id,sum(seconds)::bigint as seconds,sum(career_seconds)::bigint as career_seconds,
  sum(sectors)::bigint as sectors,sum(distance_nm)::bigint as distance_nm
from public.alliance_credit_ledger group by pilot_id,carrier_id;

-- Existing finance constraints and ordinary purchase rules remain intact.

create or replace function public.bav_alliance_book(p_pilot_id text,p_booking jsonb,p_plan jsonb,p_snapshot jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_state jsonb; v_ops jsonb; v_pilot jsonb; v_schedule jsonb; v_policy jsonb; v_active jsonb; v_id uuid; v_date date;
begin
  select policy into v_policy from alliance_settings where singleton and enabled;
  if v_policy is null then raise exception 'Alliance Operations is not enabled'; end if;
  select data into v_schedule from alliance_schedules where id=p_snapshot#>>'{schedule,id}' for share;
  if v_schedule is null or v_schedule <> p_snapshot->'schedule' or v_policy <> p_snapshot->'policy' then raise exception 'Schedule or policy changed; refresh'; end if;
  v_date := (p_booking->>'date')::date;
  if not coalesce((v_schedule->>'enabled')::boolean,false) or v_date < (v_schedule->>'validFrom')::date or v_date > (v_schedule->>'validUntil')::date
    or not (v_schedule->'days' @> to_jsonb(extract(dow from v_date)::integer)) then raise exception 'Schedule is not available on this date'; end if;
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
    or p_booking->>'aircraft'<>v_schedule->>'aircraft' or p_booking->>'fleetAircraftId' is not null then raise exception 'Invalid booking snapshot'; end if;
  insert into alliance_bookings(booking_id,pilot_id,schedule_id,carrier_id,snapshot,dispatch_approved)
    values(v_id,p_pilot_id,v_schedule->>'id',v_schedule->>'operatorId',p_snapshot,false);
  v_ops := jsonb_set(v_ops,'{bookings}',coalesce(v_ops->'bookings','[]'::jsonb)||jsonb_build_array(p_booking));
  v_ops := jsonb_set(v_ops,'{flightPlans}',coalesce(v_ops->'flightPlans','[]'::jsonb)||jsonb_build_array(p_plan));
  update pilot_state set state=jsonb_set(v_state,'{operationsState}',v_ops) where singleton;
  insert into alliance_audit(actor,action,reference,details) values(p_pilot_id,'booking.created',v_id::text,p_snapshot);
  return v_id;
end $$;

create or replace function public.bav_alliance_review(p_pirep_id uuid,p_expected_status text,p_expected_pilot jsonb,p_next_pilot jsonb,p_expected_revision integer,p_entry jsonb,p_decision text,p_actor text,p_reason text)
returns public.pilot_pireps language plpgsql security definer set search_path=public as $$
declare v_report pilot_pireps; v_booking alliance_bookings; v_state jsonb; v_pilot jsonb; v_index integer; v_revision integer;
  v_seconds integer; v_sectors integer; v_salary numeric; v_finance pilot_finance_accounts; v_balance numeric; v_original uuid;
  v_withheld numeric; v_withheld_next numeric; v_deposited numeric;
begin
  select * into v_report from pilot_pireps where id=p_pirep_id for update;
  if not found then raise exception 'Report not found'; end if;
  select * into v_booking from alliance_bookings where booking_id::text=v_report.booking_id and pilot_id=v_report.pilot_id;
  if not found then raise exception 'Alliance booking metadata missing'; end if;
  select coalesce(max(revision),0),coalesce(sum(seconds),0),coalesce(sum(sectors),0) into v_revision,v_seconds,v_sectors from alliance_credit_ledger where pirep_id=p_pirep_id;
  if p_decision='accepted' and v_sectors=1 and v_report.status='accepted' then return v_report; end if;
  if p_decision='reverse' and v_revision>0 and v_sectors=0 and v_report.status='rejected' then return v_report; end if;
  if p_expected_status<>v_report.status or p_expected_revision<>v_revision then raise exception 'ALLIANCE_CONFLICT: report changed'; end if;
  if length(trim(p_reason)) not between 3 and 2000 or length(trim(p_actor))=0 then raise exception 'Review identity and reason required'; end if;
  select state into v_state from pilot_state where singleton for update;
  select value,(ordinality-1)::integer into v_pilot,v_index from jsonb_array_elements(v_state->'pilots') with ordinality where value->>'id'=v_report.pilot_id;
  if v_pilot is null or v_pilot<>p_expected_pilot then raise exception 'ALLIANCE_CONFLICT: pilot changed'; end if;
  if p_next_pilot->>'id'<>v_report.pilot_id then raise exception 'Pilot mismatch'; end if;
  if p_decision in ('rejected','changes_requested') then
    if v_revision<>0 or p_entry is not null then raise exception 'Use a reversal for approved credit'; end if;
    update pilot_pireps set status=p_decision,staff_comments=p_reason,reviewed_by=p_actor,reviewed_at=now() where id=p_pirep_id returning * into v_report;
  else
    if p_entry is null or p_entry->>'pilotId'<>v_report.pilot_id or p_entry->>'pirepId'<>p_pirep_id::text or p_entry->>'carrierId'<>v_booking.carrier_id or (p_entry->>'revision')::integer<>v_revision+1 then raise exception 'Credit metadata mismatch'; end if;
    if p_decision='accepted' then
      if v_booking.snapshot->>'mode'='realistic_operations' and (v_booking.snapshot#>>'{policy,requireDispatchApproval}')::boolean and not v_booking.dispatch_approved then raise exception 'Dispatch approval required'; end if;
      if v_revision<>0 or v_report.status='accepted' or (p_entry->>'seconds')::integer<>round(v_report.block_minutes*60) or p_entry->>'kind'<>'approval' or (p_entry->>'sectors')::integer<>1
        or p_entry->'policy'<>v_booking.snapshot->'policy' then raise exception 'Invalid approval'; end if;
      if exists(select 1 from jsonb_array_elements(v_state#>'{operationsState,bookings}') b where b->>'id'=v_report.booking_id::text and b->>'status'='cancelled') then raise exception 'Cancelled flights cannot earn credit'; end if;
    elsif p_decision='reverse' then
      if v_sectors<>1 or p_entry->>'kind'<>'reversal' or (p_entry->>'seconds')::integer<>-v_seconds or (p_entry->>'sectors')::integer<>-1 then raise exception 'Invalid reversal'; end if;
    elsif p_decision='adjust' then
      if v_sectors<>1 or p_entry->>'kind'<>'adjustment' or (p_entry->>'sectors')::integer<>0 or v_seconds+(p_entry->>'seconds')::integer not between 60 and 172800 then raise exception 'Invalid correction'; end if;
    else raise exception 'Invalid review decision'; end if;
    insert into alliance_credit_ledger(pirep_id,pilot_id,carrier_id,revision,kind,seconds,career_seconds,sectors,distance_nm,points,tier_points,salary,xp,policy,flight,reason,actor)
    values(p_pirep_id,v_report.pilot_id,v_booking.carrier_id,v_revision+1,p_entry->>'kind',(p_entry->>'seconds')::integer,(p_entry->>'careerSeconds')::integer,(p_entry->>'sectors')::integer,(p_entry->>'distanceNm')::integer,(p_entry->>'points')::numeric,(p_entry->>'tierPoints')::numeric,(p_entry->>'salary')::numeric,coalesce((p_entry->>'xp')::integer,0),p_entry->'policy',p_entry->'flight',p_reason,p_actor);
    update pilot_state set state=jsonb_set(v_state,array['pilots',v_index::text],p_next_pilot) where singleton;
    v_salary := (p_entry->>'salary')::numeric;
    if v_salary<>0 then
      insert into pilot_finance_accounts(pilot_id) values(v_report.pilot_id) on conflict do nothing;
      select * into v_finance from pilot_finance_accounts where pilot_id=v_report.pilot_id for update;
      insert into alliance_salary_withholdings(pilot_id) values(v_report.pilot_id) on conflict do nothing;
      select remaining into v_withheld from alliance_salary_withholdings where pilot_id=v_report.pilot_id for update;
      if v_salary<0 then
        v_deposited := -least(v_finance.current_balance,-v_salary);
        v_withheld_next := v_withheld + (-v_salary + v_deposited);
      else
        v_deposited := greatest(0,v_salary-v_withheld);
        v_withheld_next := greatest(0,v_withheld-v_salary);
      end if;
      v_balance := round(v_finance.current_balance+v_deposited,2);
      insert into alliance_salary_adjustments(pirep_id,revision,pilot_id,requested,deposited,withheld_before,withheld_after)
        values(p_pirep_id,v_revision+1,v_report.pilot_id,v_salary,v_deposited,v_withheld,v_withheld_next);
      update alliance_salary_withholdings set remaining=v_withheld_next,updated_at=now() where pilot_id=v_report.pilot_id;
      select id into v_original from pilot_finance_transactions where related_pirep_id=p_pirep_id and category='flight_pay';
      if v_deposited<>0 then
      insert into pilot_finance_transactions(pilot_id,idempotency_key,category,amount,balance_before,balance_after,related_pirep_id,reversed_transaction_id,description,created_automatically,staff_member)
      values(v_report.pilot_id,'alliance-credit:'||p_pirep_id||':'||(v_revision+1),case when p_decision='accepted' then 'flight_pay' when p_decision='reverse' then 'reversal' else 'manual_adjustment' end,
        v_deposited,v_finance.current_balance,v_balance,p_pirep_id,case when p_decision='reverse' then v_original else null end,'Virtual alliance flight '||p_decision||': '||v_report.flight_number,true,p_actor);
      update pilot_finance_accounts set current_balance=v_balance,lifetime_earnings=lifetime_earnings+greatest(v_deposited,0),current_month_earnings=current_month_earnings+greatest(v_deposited,0),updated_at=now() where pilot_id=v_report.pilot_id;
      end if;
    end if;
    update pilot_pireps set status=case when p_decision='reverse' then 'rejected' else 'accepted' end,
      block_minutes=case when p_decision='adjust' then (v_seconds+(p_entry->>'seconds')::integer)::numeric/60 else block_minutes end,
      points_awarded=(select sum(points) from alliance_credit_ledger where pirep_id=p_pirep_id),
      tier_points_awarded=(select sum(tier_points) from alliance_credit_ledger where pirep_id=p_pirep_id),
      staff_comments=p_reason,reviewed_by=p_actor,reviewed_at=now() where id=p_pirep_id returning * into v_report;
  end if;
  insert into alliance_audit(actor,action,reference,details) values(p_actor,'pirep.'||p_decision,p_pirep_id::text,jsonb_build_object('reason',p_reason,'entry',p_entry));
  return v_report;
end $$;

-- Immutable accounting/audit records: corrections always append.
create or replace function public.bav_alliance_admin(p_action text,p_actor text,p_payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare r jsonb;
begin
  if length(trim(p_actor))=0 then raise exception 'Staff identity required'; end if;
  if p_action='import' then
    if jsonb_typeof(p_payload)<>'array' or jsonb_array_length(p_payload) not between 1 and 500 then raise exception 'Import 1-500 schedules'; end if;
    for r in select value from jsonb_array_elements(p_payload) loop
      if not (r ?& array['id','sourceUrl','permission','verifiedAt','validFrom','validUntil','callsign']) or length(trim(r->>'permission'))=0 then raise exception 'Schedule provenance missing'; end if;
      insert into alliance_schedules(id,operator_id,marketing_carrier_id,data,updated_by)
        values(r->>'id',r->>'operatorId',r->>'marketingCarrierId',r,p_actor)
        on conflict(id) do update set operator_id=excluded.operator_id,marketing_carrier_id=excluded.marketing_carrier_id,data=excluded.data,updated_by=excluded.updated_by,updated_at=now();
    end loop;
  elsif p_action='settings' then
    if not (p_payload->'policy' ?& array['version','career','salary','points','tierPoints','rank','requireDispatchApproval','milestones']) then raise exception 'Incomplete credit policy'; end if;
    update alliance_settings set enabled=(p_payload->>'enabled')::boolean,policy=p_payload->'policy',updated_at=now() where singleton;
  elsif p_action='carrier' then
    update alliance_carriers set enabled=(p_payload->>'enabled')::boolean where id=p_payload->>'id';
    if not found then raise exception 'Carrier not found'; end if;
  elsif p_action='membership' then
    insert into alliance_memberships(carrier_id,valid_from,valid_until,eligible,kind,source_url)
      values(p_payload->>'carrierId',(p_payload->>'validFrom')::date,nullif(p_payload->>'validUntil','')::date,(p_payload->>'eligible')::boolean,p_payload->>'kind',p_payload->>'sourceUrl')
      on conflict(carrier_id,valid_from) do update set valid_until=excluded.valid_until,eligible=excluded.eligible,kind=excluded.kind,source_url=excluded.source_url;
  elsif p_action='affiliate' then
    if not exists(select 1 from alliance_carriers where id=p_payload->>'parentId' and parent_id is null) then raise exception 'Member parent required'; end if;
    insert into alliance_carriers(id,name,iata,icao,parent_id,source_url) values(p_payload->>'id',p_payload->>'name',p_payload->>'iata',p_payload->>'icao',p_payload->>'parentId',p_payload->>'sourceUrl');
    -- No membership is implicitly granted: staff must add an approved period.
  elsif p_action='dispatch' then
    update alliance_bookings set dispatch_approved=(p_payload->>'approved')::boolean where booking_id=(p_payload->>'bookingId')::uuid;
    if not found then raise exception 'Alliance booking not found'; end if;
  elsif p_action='recalculate' then
    -- Derived balances have no mutable cache to corrupt. Validate the invariant.
    if exists(select 1 from alliance_airline_banks where seconds<0 or sectors<0 or career_seconds<0) then raise exception 'Ledger imbalance requires staff investigation'; end if;
  else raise exception 'Unknown alliance change'; end if;
  insert into alliance_audit(actor,action,reference,details) values(p_actor,'admin.'||p_action,coalesce(p_payload->>'id',p_payload->>'carrierId',p_payload->>'bookingId','alliance'),p_payload);
end $$;
revoke all on function public.bav_alliance_admin(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.bav_alliance_admin(text,text,jsonb) to service_role;

create or replace function public.bav_alliance_immutable() returns trigger language plpgsql as $$
begin raise exception 'Alliance history is immutable; append a correction'; end $$;
drop trigger if exists alliance_ledger_immutable on public.alliance_credit_ledger;
create trigger alliance_ledger_immutable before update or delete on public.alliance_credit_ledger for each row execute function public.bav_alliance_immutable();
drop trigger if exists alliance_audit_immutable on public.alliance_audit;
create trigger alliance_audit_immutable before update or delete on public.alliance_audit for each row execute function public.bav_alliance_immutable();
drop trigger if exists alliance_salary_adjustments_immutable on public.alliance_salary_adjustments;
create trigger alliance_salary_adjustments_immutable before update or delete on public.alliance_salary_adjustments for each row execute function public.bav_alliance_immutable();

do $$ declare t text; begin
  foreach t in array array['alliance_settings','alliance_carriers','alliance_memberships','alliance_schedules','alliance_bookings','alliance_credit_ledger','alliance_audit','alliance_exports','alliance_salary_withholdings','alliance_salary_adjustments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to service_role',t);
  end loop;
end $$;
grant insert on public.alliance_exports to service_role;
revoke all on public.alliance_airline_banks from public,anon,authenticated;
grant select on public.alliance_airline_banks to service_role;
revoke all on function public.bav_alliance_book(text,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.bav_alliance_review(uuid,text,jsonb,jsonb,integer,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.bav_alliance_book(text,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.bav_alliance_review(uuid,text,jsonb,jsonb,integer,jsonb,text,text,text) to service_role;
commit;
