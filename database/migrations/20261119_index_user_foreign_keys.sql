-- Cover user_id foreign-key lookups used by account and ad-session endpoints.
create index if not exists kencoin_ad_sessions_telegram_id_idx
  on public.kencoin_ad_sessions (telegram_id);
create index if not exists kencoin_invoices_telegram_id_idx
  on public.kencoin_invoices (telegram_id);
