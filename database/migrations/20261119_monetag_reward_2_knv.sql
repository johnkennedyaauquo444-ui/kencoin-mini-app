-- Align Monetag rewarded-ad credit with the approved Kencoin reward.
-- Only a server-verified valued postback reaches this function.
create or replace function public.kencoin_credit_ad(
  p_ymid text,
  p_telegram_id bigint,
  p_estimated_price text
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog, public, pg_temp
as $$
declare
  changed integer;
  result jsonb;
begin
  update public.kencoin_ad_sessions
  set status='rewarded', verified_at=now()
  where ymid=p_ymid
    and telegram_id=p_telegram_id
    and status='pending';
  get diagnostics changed = row_count;
  if changed=0 then
    return jsonb_build_object('credited',false,'reason','duplicate_or_unknown');
  end if;
  result := public.kencoin_claim_reward(
    p_telegram_id, 2, 'monetag_reward',
    'monetag-'||p_ymid,
    'Verified Monetag rewarded ad',
    jsonb_build_object('ymid',p_ymid,'estimated_price',p_estimated_price)
  );
  return result;
end;
$$;
