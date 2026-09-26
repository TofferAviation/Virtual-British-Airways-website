-- British Airways Virtual career, finance and qualification foundation.
-- All amounts are virtual-economy values. No table represents real-world pay,
-- fees, employment, or a British Airways financial product.

create table if not exists public.career_economy_settings (
  singleton boolean primary key default true check (singleton),
  settings jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.career_economy_settings (singleton, settings)
values (
  true,
  jsonb_build_object(
    'currency', 'GBP',
    'label', 'British Airways Virtual economy values',
    'rankHourlyRates', jsonb_build_object(
      'Cadet', 15, 'Second Officer', 30, 'First Officer', 40,
      'Senior First Officer', 55, 'Captain', 75,
      'Senior Captain', 90, 'Training Captain', 105
    ),
    'aircraftMultipliers', jsonb_build_object(
      'E190', 1.00, 'A320_FAMILY', 1.00, 'A320_NEO', 1.03,
      'B777', 1.12, 'B787', 1.12, 'A350', 1.15, 'A380', 1.18
    ),
    'sectorAllowance', 20, 'longHaulAllowance', 80,
    'commandBonus', 20, 'instructorBonus', 25,
    'longHaulThresholdMinutes', 360
  )
)
on conflict (singleton) do nothing;

create table if not exists public.pilot_finance_accounts (
  pilot_id text primary key,
  currency text not null default 'GBP' check (currency = 'GBP'),
  current_balance numeric(12,2) not null default 0 check (current_balance >= 0),
  lifetime_earnings numeric(12,2) not null default 0 check (lifetime_earnings >= 0),
  current_month_earnings numeric(12,2) not null default 0 check (current_month_earnings >= 0),
  previous_month_earnings numeric(12,2) not null default 0 check (previous_month_earnings >= 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.pilot_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  pilot_id text not null,
  idempotency_key text not null unique,
  category text not null check (category in (
    'flight_pay', 'bonus', 'allowance', 'training_payment',
    'qualification_payment', 'recurrent_training', 'refund',
    'manual_adjustment', 'reversal'
  )),
  amount numeric(12,2) not null check (amount <> 0),
  balance_before numeric(12,2) not null,
  balance_after numeric(12,2) not null check (balance_after >= 0),
  related_pirep_id uuid references public.pilot_pireps(id) on delete set null,
  related_training_application_id uuid,
  related_qualification_id uuid,
  reversed_transaction_id uuid references public.pilot_finance_transactions(id) on delete restrict,
  description text not null check (char_length(description) between 3 and 500),
  created_automatically boolean not null default true,
  staff_member text,
  created_at timestamptz not null default now()
);

create index if not exists pilot_finance_transactions_pilot_created_idx
  on public.pilot_finance_transactions (pilot_id, created_at desc);
create unique index if not exists pilot_finance_transactions_flight_pay_once_idx
  on public.pilot_finance_transactions (related_pirep_id)
  where category = 'flight_pay' and related_pirep_id is not null;

create table if not exists public.qualification_definitions (
  id text primary key,
  kind text not null check (kind in ('type_rating', 'command', 'instructor')),
  name text not null,
  aircraft_family text,
  variants jsonb not null default '[]'::jsonb,
  description text not null,
  virtual_training_cost numeric(12,2) not null default 0 check (virtual_training_cost >= 0),
  recurrent_training_cost numeric(12,2) not null default 0 check (recurrent_training_cost >= 0),
  requirements jsonb not null default '{}'::jsonb,
  training_modules jsonb not null default '[]'::jsonb,
  check_flight_required boolean not null default false,
  staff_approval_required boolean not null default true,
  validity_months integer check (validity_months is null or validity_months between 1 and 120),
  recurrent_interval_months integer check (recurrent_interval_months is null or recurrent_interval_months between 1 and 120),
  available boolean not null default true,
  display_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.training_applications (
  id uuid primary key default gen_random_uuid(),
  pilot_id text not null,
  qualification_definition_id text not null references public.qualification_definitions(id) on delete restrict,
  status text not null check (status in (
    'not_eligible', 'eligible', 'application_submitted', 'awaiting_approval',
    'approved', 'payment_pending', 'training_assigned', 'training_in_progress',
    'check_flight_required', 'check_flight_submitted', 'check_flight_review',
    'passed', 'failed', 'type_rating_issued', 'expired', 'suspended'
  )),
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by text,
  payment_transaction_id uuid references public.pilot_finance_transactions(id) on delete set null,
  assigned_instructor text,
  staff_note text,
  check_flight_pirep_id uuid references public.pilot_pireps(id) on delete set null,
  check_flight_outcome text check (check_flight_outcome in ('passed', 'failed', 'retry')),
  check_flight_reviewed_by text,
  check_flight_reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists training_applications_one_open_rating_idx
  on public.training_applications (pilot_id, qualification_definition_id)
  where status not in ('failed', 'type_rating_issued', 'expired', 'suspended');
create index if not exists training_applications_staff_queue_idx
  on public.training_applications (status, updated_at desc);

create table if not exists public.pilot_training_module_progress (
  id uuid primary key default gen_random_uuid(),
  training_application_id uuid not null references public.training_applications(id) on delete cascade,
  module_id text not null,
  completed_at timestamptz,
  completed_by text,
  created_at timestamptz not null default now(),
  unique (training_application_id, module_id)
);

create table if not exists public.pilot_qualifications (
  id uuid primary key default gen_random_uuid(),
  pilot_id text not null,
  qualification_definition_id text not null references public.qualification_definitions(id) on delete restrict,
  status text not null check (status in ('valid', 'expiring_soon', 'recurrent_due', 'expired', 'suspended')),
  source text not null check (source in ('training', 'grandfathered', 'manual')),
  issued_at timestamptz not null default now(),
  issued_by text,
  training_application_id uuid references public.training_applications(id) on delete set null,
  check_flight_pirep_id uuid references public.pilot_pireps(id) on delete set null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  last_recurrent_at timestamptz,
  next_recurrent_at timestamptz,
  staff_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pilot_id, qualification_definition_id)
);

create index if not exists pilot_qualifications_pilot_status_idx
  on public.pilot_qualifications (pilot_id, status);

create table if not exists public.qualification_audit_log (
  id uuid primary key default gen_random_uuid(),
  pilot_id text not null,
  training_application_id uuid references public.training_applications(id) on delete set null,
  qualification_id uuid references public.pilot_qualifications(id) on delete set null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  staff_member text,
  created_at timestamptz not null default now()
);
create index if not exists qualification_audit_log_pilot_created_idx
  on public.qualification_audit_log (pilot_id, created_at desc);

-- Staff-managed programme rules are operational configuration. Keep an
-- append-only history so a changed price or eligibility threshold is never
-- mistaken for a pilot action.
create table if not exists public.career_configuration_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  staff_member text not null,
  created_at timestamptz not null default now()
);
create index if not exists career_configuration_audit_log_entity_created_idx
  on public.career_configuration_audit_log (entity_id, created_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pilot_finance_transactions_training_application_fk') then
    alter table public.pilot_finance_transactions
      add constraint pilot_finance_transactions_training_application_fk
      foreign key (related_training_application_id) references public.training_applications(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pilot_finance_transactions_qualification_fk') then
    alter table public.pilot_finance_transactions
      add constraint pilot_finance_transactions_qualification_fk
      foreign key (related_qualification_id) references public.pilot_qualifications(id) on delete set null;
  end if;
end;
$$;

-- Atomic, idempotent virtual-ledger posting. Service-role application code is
-- the only caller; browsers never receive direct write policies for this data.
create or replace function public.bav_post_finance_transaction(
  p_pilot_id text,
  p_idempotency_key text,
  p_category text,
  p_amount numeric,
  p_description text,
  p_related_pirep_id uuid default null,
  p_related_training_application_id uuid default null,
  p_related_qualification_id uuid default null,
  p_reversed_transaction_id uuid default null,
  p_created_automatically boolean default true,
  p_staff_member text default null
)
returns table (transaction_id uuid, balance_before numeric, balance_after numeric, posted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(12,2);
  v_before numeric(12,2);
  v_transaction_id uuid;
begin
  if p_amount = 0 then raise exception 'Virtual finance transactions cannot have a zero amount'; end if;
  if char_length(trim(p_description)) < 3 then raise exception 'A finance description is required'; end if;

  select id, balance_before, balance_after into v_transaction_id, v_before, v_balance
  from public.pilot_finance_transactions where idempotency_key = p_idempotency_key;
  if found then
    return query select v_transaction_id, v_before, v_balance, false;
    return;
  end if;

  insert into public.pilot_finance_accounts (pilot_id) values (p_pilot_id)
  on conflict (pilot_id) do nothing;
  select current_balance into v_before from public.pilot_finance_accounts
  where pilot_id = p_pilot_id for update;
  v_balance := round(v_before + p_amount, 2);
  if v_balance < 0 then raise exception 'Insufficient virtual account balance'; end if;

  begin
    insert into public.pilot_finance_transactions (
      pilot_id, idempotency_key, category, amount, balance_before, balance_after,
      related_pirep_id, related_training_application_id, related_qualification_id,
      reversed_transaction_id, description, created_automatically, staff_member
    ) values (
      p_pilot_id, p_idempotency_key, p_category, round(p_amount, 2), v_before, v_balance,
      p_related_pirep_id, p_related_training_application_id, p_related_qualification_id,
      p_reversed_transaction_id, trim(p_description), p_created_automatically, p_staff_member
    ) returning id into v_transaction_id;
  exception when unique_violation then
    select id, balance_before, balance_after into v_transaction_id, v_before, v_balance
    from public.pilot_finance_transactions where idempotency_key = p_idempotency_key;
    return query select v_transaction_id, v_before, v_balance, false;
    return;
  end;

  update public.pilot_finance_accounts
  set current_balance = v_balance,
      lifetime_earnings = lifetime_earnings + greatest(p_amount, 0),
      current_month_earnings = current_month_earnings + greatest(p_amount, 0),
      updated_at = now()
  where pilot_id = p_pilot_id;

  return query select v_transaction_id, v_before, v_balance, true;
end;
$$;

alter table public.career_economy_settings enable row level security;
alter table public.pilot_finance_accounts enable row level security;
alter table public.pilot_finance_transactions enable row level security;
alter table public.qualification_definitions enable row level security;
alter table public.training_applications enable row level security;
alter table public.pilot_training_module_progress enable row level security;
alter table public.pilot_qualifications enable row level security;
alter table public.qualification_audit_log enable row level security;
alter table public.career_configuration_audit_log enable row level security;

-- Seed configurable virtual type-rating definitions. Existing pilots retain
-- their legacy ratings until staff chooses to grandfather them into this table.
insert into public.qualification_definitions (
  id, kind, name, aircraft_family, variants, description, virtual_training_cost,
  recurrent_training_cost, requirements, training_modules, check_flight_required,
  staff_approval_required, validity_months, recurrent_interval_months, display_order
) values
  ('E190', 'type_rating', 'Embraer E170/190', 'E190', '["E170","E190"]', 'Regional multi-crew virtual qualification.', 8000, 1800, '{"minimumRank":"Second Officer","minimumHours":40,"minimumSectors":15}', '["Aircraft Systems","Standard Operating Procedures","Normal Operations","Check Flight"]', true, true, 24, 24, 10),
  ('A320_FAMILY', 'type_rating', 'Airbus A320 Family', 'A320_FAMILY', '["A319","A320","A321","A320neo","A321neo"]', 'A319, A320 and A321 family virtual qualification.', 10000, 2200, '{"minimumRank":"Second Officer","minimumHours":50,"minimumSectors":20}', '["Aircraft Systems","Standard Operating Procedures","Normal Operations","Abnormal Procedures","Check Flight"]', true, true, 24, 24, 20),
  ('B787', 'type_rating', 'Boeing 787', 'B787', '["B787-8","B787-9","B787-10"]', 'Long-haul Boeing 787 virtual type rating.', 18000, 3800, '{"minimumRank":"First Officer","minimumHours":200,"minimumSectors":60,"prerequisite":"A320_FAMILY"}', '["Aircraft Systems","Standard Operating Procedures","Normal Operations","Abnormal Procedures","Simulator / Knowledge Assessment","Check Flight"]', true, true, 24, 24, 30),
  ('B777', 'type_rating', 'Boeing 777', 'B777', '["B777-200ER","B777-300ER"]', 'Long-haul Boeing 777 virtual type rating.', 20000, 4200, '{"minimumRank":"First Officer","minimumHours":250,"minimumSectors":75}', '["Aircraft Systems","Standard Operating Procedures","Normal Operations","Abnormal Procedures","Simulator / Knowledge Assessment","Check Flight"]', true, true, 24, 24, 40),
  ('A350', 'type_rating', 'Airbus A350', 'A350', '["A350-900","A350-1000"]', 'Long-haul Airbus A350 virtual type rating.', 22000, 4600, '{"minimumRank":"Senior First Officer","minimumHours":350,"minimumSectors":100}', '["Aircraft Systems","Standard Operating Procedures","Normal Operations","Abnormal Procedures","Simulator / Knowledge Assessment","Check Flight"]', true, true, 24, 24, 50),
  ('A380', 'type_rating', 'Airbus A380', 'A380', '["A380-800"]', 'Flagship Airbus A380 virtual type rating.', 27500, 5500, '{"minimumRank":"Senior First Officer","minimumHours":500,"minimumSectors":140}', '["Aircraft Systems","Standard Operating Procedures","Normal Operations","Abnormal Procedures","Simulator / Knowledge Assessment","Check Flight"]', true, true, 24, 24, 60),
  ('COMMAND', 'command', 'Command Upgrade', null, '[]', 'Virtual command qualification; separate from rank and type rating.', 7500, 1500, '{"minimumRank":"Senior First Officer","minimumHours":800,"minimumSectors":200,"requiresValidTypeRating":true}', '["Command Course","Command Decision Making","Command Check"]', true, true, 24, 24, 70)
on conflict (id) do nothing;
