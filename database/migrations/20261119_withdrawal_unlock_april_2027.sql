-- Move the Kencoin withdrawal gate to 1 April 2027, midnight Africa/Lagos.
create or replace function public.kencoin_create_withdrawal(
  p_telegram_id bigint,
  p_amount integer,
  p_network text,
  p_wallet_address text
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog, public, pg_temp
as $$
declare
  min_amount integer;
  current_balance bigint;
  reserved bigint;
  new_id uuid;
begin
  if now() < timestamptz '2027-04-01 00:00:00+01' then
    raise exception 'withdrawals_locked';
  end if;

  select nullif(setting_value,'')::integer
    into min_amount
    from public.kencoin_settings
    where setting_key='minimum_withdrawal_knv';

  if min_amount is null or min_amount<=0 then
    raise exception 'withdrawal_setup_incomplete';
  end if;
  if p_amount is null or p_amount<=0 then
    raise exception 'invalid_withdrawal_amount';
  end if;
  if p_amount<min_amount then
    raise exception 'below_minimum_withdrawal';
  end if;
  if p_network is null or p_network not in ('USDT_TRC20','USDT_BEP20') then
    raise exception 'invalid_network';
  end if;

  if p_wallet_address is null or length(trim(p_wallet_address))=0 then
    raise exception 'invalid_wallet_address';
  end if;

  perform pg_advisory_xact_lock(p_telegram_id);
  select coalesce(sum(amount),0)
    into current_balance
    from public.kencoin_ledger
    where telegram_id=p_telegram_id;
  select coalesce(sum(amount),0)
    into reserved
    from public.kencoin_withdrawals
    where telegram_id=p_telegram_id and status in ('pending','approved');

  if current_balance-reserved<p_amount then
    raise exception 'insufficient_available_balance';
  end if;

  insert into public.kencoin_withdrawals(telegram_id,amount,network,wallet_address)
    values(p_telegram_id,p_amount,p_network,p_wallet_address)
    returning id into new_id;

  return jsonb_build_object('ok',true,'withdrawal_id',new_id,'status','pending');
end;
$$;

revoke all on function public.kencoin_create_withdrawal(bigint,integer,text,text) from public, anon, authenticated;
grant execute on function public.kencoin_create_withdrawal(bigint,integer,text,text) to service_role;
