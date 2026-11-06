-- Qualify columns that share names with the function's output parameters.
-- Discovered while testing alliance salary reversal after spending virtual pay.
begin;
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

  select t.id, t.balance_before, t.balance_after into v_transaction_id, v_before, v_balance
  from public.pilot_finance_transactions t where t.idempotency_key = p_idempotency_key;
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
    select t.id, t.balance_before, t.balance_after into v_transaction_id, v_before, v_balance
    from public.pilot_finance_transactions t where t.idempotency_key = p_idempotency_key;
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

-- This function runs with elevated database privileges. Only authenticated
-- application services, never browser roles, may post virtual transactions.
revoke all on function public.bav_post_finance_transaction(text,text,text,numeric,text,uuid,uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.bav_post_finance_transaction(text,text,text,numeric,text,uuid,uuid,uuid,uuid,boolean,text) to service_role;
commit;
