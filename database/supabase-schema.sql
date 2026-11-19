create extension if not exists pgcrypto;

create table if not exists public.kencoin_profiles (
  telegram_id bigint primary key,
  username text,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kencoin_ledger (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null references public.kencoin_profiles(telegram_id),
  amount integer not null check (amount <> 0),
  entry_type text not null,
  reference text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (telegram_id, reference)
);
create index if not exists kencoin_ledger_user_created on public.kencoin_ledger(telegram_id, created_at desc);

create table if not exists public.kencoin_invoices (
  payload text primary key,
  telegram_id bigint not null references public.kencoin_profiles(telegram_id),
  plan text not null check (plan in ('silver','gold','diamond')),
  stars integer not null check (stars in (100,250,500)),
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  telegram_charge_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  expires_at timestamptz
);

create table if not exists public.kencoin_ad_sessions (
  ymid text primary key,
  telegram_id bigint not null references public.kencoin_profiles(telegram_id),
  zone_id text not null,
  status text not null default 'pending' check (status in ('pending','rewarded','ignored')),
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create table if not exists public.kencoin_referrals (
  invitee_id bigint primary key references public.kencoin_profiles(telegram_id),
  referrer_id bigint not null references public.kencoin_profiles(telegram_id),
  created_at timestamptz not null default now(),
  check (invitee_id <> referrer_id)
);
create index if not exists kencoin_referrals_referrer on public.kencoin_referrals(referrer_id);

create table if not exists public.kencoin_withdrawals (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null references public.kencoin_profiles(telegram_id),
  amount integer not null check (amount > 0),
  network text not null check (network in ('USDT_TRC20','USDT_BEP20')),
  wallet_address text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  admin_note text,
  tx_reference text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  paid_at timestamptz
);
create index if not exists kencoin_withdrawals_user on public.kencoin_withdrawals(telegram_id, created_at desc);

create table if not exists public.kencoin_settings (
  setting_key text primary key,
  setting_value text not null
);
-- Set this after the owner chooses a minimum. Until then, withdrawal submission stays safely disabled.
insert into public.kencoin_settings(setting_key,setting_value)
values ('minimum_withdrawal_knv','')
on conflict (setting_key) do nothing;

alter table public.kencoin_profiles enable row level security;
alter table public.kencoin_ledger enable row level security;
alter table public.kencoin_invoices enable row level security;
alter table public.kencoin_ad_sessions enable row level security;
alter table public.kencoin_referrals enable row level security;
alter table public.kencoin_withdrawals enable row level security;
alter table public.kencoin_settings enable row level security;

revoke all on public.kencoin_profiles, public.kencoin_ledger, public.kencoin_invoices,
  public.kencoin_ad_sessions, public.kencoin_referrals, public.kencoin_withdrawals,
  public.kencoin_settings from anon, authenticated;

create or replace function public.kencoin_claim_reward(
  p_telegram_id bigint, p_amount integer, p_entry_type text,
  p_reference text, p_description text, p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog, public, pg_temp as $$
declare inserted_count integer; current_balance bigint;
begin
  if p_amount <= 0 or p_amount > 10000 then raise exception 'invalid_reward_amount'; end if;
  insert into kencoin_ledger(telegram_id,amount,entry_type,reference,description,metadata)
  values(p_telegram_id,p_amount,p_entry_type,p_reference,p_description,coalesce(p_metadata,'{}'::jsonb))
  on conflict(telegram_id,reference) do nothing;
  get diagnostics inserted_count = row_count;
  select coalesce(sum(amount),0) into current_balance from kencoin_ledger where telegram_id=p_telegram_id;
  return jsonb_build_object('credited',inserted_count=1,'amount',case when inserted_count=1 then p_amount else 0 end,'balance',current_balance);
end $$;

create or replace function public.kencoin_credit_ad(p_ymid text,p_telegram_id bigint,p_estimated_price text)
returns jsonb language plpgsql security definer set search_path=pg_catalog, public, pg_temp as $$
declare changed integer; result jsonb;
begin
  update kencoin_ad_sessions set status='rewarded',verified_at=now()
  where ymid=p_ymid and telegram_id=p_telegram_id and status='pending';
  get diagnostics changed = row_count;
  if changed=0 then return jsonb_build_object('credited',false,'reason','duplicate_or_unknown'); end if;
  result := kencoin_claim_reward(p_telegram_id,2,'monetag_reward','monetag-'||p_ymid,'Verified Monetag rewarded ad',jsonb_build_object('ymid',p_ymid,'estimated_price',p_estimated_price));
  return result;
end $$;

create or replace function public.kencoin_confirm_stars(
  p_payload text,p_telegram_id bigint,p_currency text,p_total_amount integer,p_charge_id text
) returns jsonb language plpgsql security definer set search_path=pg_catalog, public, pg_temp as $$
declare inv kencoin_invoices%rowtype; last_expiry timestamptz; new_expiry timestamptz;
begin
  select * into inv from kencoin_invoices where payload=p_payload for update;
  if not found then raise exception 'unknown_invoice'; end if;
  if inv.telegram_id is distinct from p_telegram_id or split_part(p_payload,'_',2) is distinct from inv.plan or split_part(p_payload,'_',3) is distinct from p_telegram_id::text then raise exception 'invoice_user_mismatch'; end if;
  if inv.created_at < now() - interval '24 hours' then raise exception 'invoice_expired'; end if;
  if p_currency is distinct from 'XTR' or p_total_amount is distinct from inv.stars then raise exception 'payment_amount_or_currency_mismatch'; end if;
  if coalesce(p_charge_id,'')='' then raise exception 'missing_telegram_charge_id'; end if;
  if exists(select 1 from kencoin_invoices where telegram_charge_id=p_charge_id and payload<>p_payload) then raise exception 'charge_already_used'; end if;
  if inv.status='paid' then
    if inv.telegram_charge_id=p_charge_id then return jsonb_build_object('ok',true,'duplicate',true,'plan',inv.plan,'expires_at',inv.expires_at); end if;
    raise exception 'invoice_already_paid';
  end if;
  if inv.status<>'pending' then raise exception 'invoice_not_pending'; end if;
  select max(expires_at) into last_expiry from kencoin_invoices where telegram_id=p_telegram_id and status='paid' and expires_at>now();
  new_expiry := greatest(now(),coalesce(last_expiry,now())) + interval '30 days';
  update kencoin_invoices set status='paid',telegram_charge_id=p_charge_id,paid_at=now(),expires_at=new_expiry where payload=p_payload;
  return jsonb_build_object('ok',true,'duplicate',false,'plan',inv.plan,'expires_at',new_expiry);
end $$;

create or replace function public.kencoin_register_referral(p_invitee bigint,p_referrer bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog, public, pg_temp as $$
declare inserted_count integer;
begin
  if p_invitee=p_referrer then raise exception 'self_referral_not_allowed'; end if;
  if not exists(select 1 from kencoin_profiles where telegram_id=p_referrer) then raise exception 'referrer_not_found'; end if;
  insert into kencoin_referrals(invitee_id,referrer_id) values(p_invitee,p_referrer) on conflict(invitee_id) do nothing;
  get diagnostics inserted_count=row_count;
  return jsonb_build_object('registered',inserted_count=1);
end $$;

create or replace function public.kencoin_create_withdrawal(
  p_telegram_id bigint,p_amount integer,p_network text,p_wallet_address text
) returns jsonb language plpgsql security definer set search_path=pg_catalog, public, pg_temp as $$
declare current_balance bigint; reserved bigint; new_id uuid;
begin
  if now() < timestamptz '2027-04-01 00:00:00+01' then raise exception 'withdrawals_locked'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'invalid_withdrawal_amount'; end if;
  if p_network not in ('USDT_TRC20','USDT_BEP20') then raise exception 'invalid_network'; end if;
  perform pg_advisory_xact_lock(p_telegram_id);
  select coalesce(sum(amount),0) into current_balance from kencoin_ledger where telegram_id=p_telegram_id;
  select coalesce(sum(amount),0) into reserved from kencoin_withdrawals where telegram_id=p_telegram_id and status in ('pending','approved');
  if current_balance-reserved<p_amount then raise exception 'insufficient_available_balance'; end if;
  insert into kencoin_withdrawals(telegram_id,amount,network,wallet_address)
  values(p_telegram_id,p_amount,p_network,p_wallet_address) returning id into new_id;
  return jsonb_build_object('ok',true,'withdrawal_id',new_id,'status','pending');
end $$;

create or replace function public.kencoin_review_withdrawal(
  p_withdrawal_id uuid,p_status text,p_admin_note text default null,p_tx_reference text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog, public, pg_temp as $$
declare w kencoin_withdrawals%rowtype;
begin
  select * into w from kencoin_withdrawals where id=p_withdrawal_id for update;
  if not found then raise exception 'withdrawal_not_found'; end if;
  if w.status not in ('pending','approved') then raise exception 'withdrawal_already_final'; end if;
  if p_status='approved' then
    update kencoin_withdrawals set status='approved',admin_note=p_admin_note,reviewed_at=now() where id=p_withdrawal_id;
  elsif p_status='rejected' then
    update kencoin_withdrawals set status='rejected',admin_note=p_admin_note,reviewed_at=now() where id=p_withdrawal_id;
  elsif p_status='paid' then
    if w.status<>'approved' or coalesce(p_tx_reference,'')='' then raise exception 'approval_and_tx_reference_required'; end if;
    -- Serialize payout finalization with new withdrawal requests for this wallet.
    -- Without the shared lock, a concurrent request could read the pre-debit
    -- balance together with the post-payout released reservation.
    perform pg_advisory_xact_lock(w.telegram_id);
    insert into kencoin_ledger(telegram_id,amount,entry_type,reference,description,metadata)
    values(w.telegram_id,-w.amount,'withdrawal','withdrawal-'||w.id,'USDT withdrawal paid',jsonb_build_object('network',w.network,'tx_reference',p_tx_reference));
    update kencoin_withdrawals set status='paid',tx_reference=p_tx_reference,paid_at=now(),reviewed_at=coalesce(reviewed_at,now()) where id=p_withdrawal_id;
  else raise exception 'invalid_withdrawal_status'; end if;
  return jsonb_build_object('ok',true,'withdrawal_id',p_withdrawal_id,'status',p_status);
end $$;

revoke all on function public.kencoin_claim_reward(bigint,integer,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.kencoin_credit_ad(text,bigint,text) from public, anon, authenticated;
revoke all on function public.kencoin_confirm_stars(text,bigint,text,integer,text) from public, anon, authenticated;
revoke all on function public.kencoin_register_referral(bigint,bigint) from public, anon, authenticated;
revoke all on function public.kencoin_create_withdrawal(bigint,integer,text,text) from public, anon, authenticated;
revoke all on function public.kencoin_review_withdrawal(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.kencoin_claim_reward(bigint,integer,text,text,text,jsonb) to service_role;
grant execute on function public.kencoin_credit_ad(text,bigint,text) to service_role;
grant execute on function public.kencoin_confirm_stars(text,bigint,text,integer,text) to service_role;
grant execute on function public.kencoin_register_referral(bigint,bigint) to service_role;
grant execute on function public.kencoin_create_withdrawal(bigint,integer,text,text) to service_role;
grant execute on function public.kencoin_review_withdrawal(uuid,text,text,text) to service_role;
