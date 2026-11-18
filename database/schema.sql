CREATE TABLE IF NOT EXISTS users (
 telegram_id TEXT PRIMARY KEY, username TEXT, first_name TEXT, last_name TEXT,
 balance BIGINT NOT NULL DEFAULT 0, membership TEXT NOT NULL DEFAULT 'STANDARD',
 membership_expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ledger (
 id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(telegram_id),
 amount BIGINT NOT NULL, entry_type TEXT NOT NULL, reference TEXT NOT NULL UNIQUE,
 description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_user_created_idx ON ledger(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS ad_shows (
 ymid TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(telegram_id),
 zone_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ad_rewards (
 ymid TEXT PRIMARY KEY REFERENCES ad_shows(ymid), user_id TEXT NOT NULL REFERENCES users(telegram_id),
 estimated_price NUMERIC(14,7) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payments (
 payload TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(telegram_id), plan TEXT NOT NULL,
 stars INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', telegram_charge_id TEXT UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), paid_at TIMESTAMPTZ
);
