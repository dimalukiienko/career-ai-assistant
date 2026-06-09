-- Initial schema: Telegram user profiles + their Google OAuth connections.
--
-- Tokens were previously held in-memory (lost on cold start). This moves them to Postgres so
-- they survive restarts and the service can scale past a single instance. Conversation
-- sessions remain in-memory for now (no table here).
--
-- Access is exclusively via the backend's service_role key, so RLS is intentionally left
-- disabled. `refresh_token_enc` holds the app-layer ciphertext string (self-describing
-- `v1:kms:..` / `v1:local:..`), not raw bytes — stored as text on purpose.

create table if not exists profiles (
  id                uuid primary key default gen_random_uuid(),
  telegram_id       bigint unique,
  telegram_username text,
  first_name        text,
  last_name         text,
  language_code     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists google_connections (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references profiles(id) on delete cascade,
  google_email      text,
  refresh_token_enc text not null,                  -- ciphertext (v1:kms:.. / v1:local:..)
  scopes            text[] not null default '{}',
  revoked_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (profile_id, google_email)
);

create index if not exists google_connections_profile_id_idx on google_connections (profile_id);
