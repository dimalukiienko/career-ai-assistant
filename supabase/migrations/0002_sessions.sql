-- Conversation sessions: persistent chat history + token-based rotation.
--
-- History was previously in-memory (lost on cold start, per-instance). This moves it to
-- Postgres so it survives restarts and the service can scale past a single instance — the
-- last persistence gap from 0001 (profiles/tokens already persist).
--
-- A user has at most one *active* (unfinished) session: `ended_at is null`. The agent appends
-- each turn's messages and records the context `token_count`; when it crosses a threshold the
-- bot offers to summarize & continue or start fresh. Rotating closes the active row and opens
-- a new one carrying a `summary` so continuity survives the reset.
--
-- Access is exclusively via the backend's service_role key, so RLS is intentionally left
-- disabled. `messages` holds the AI SDK ModelMessage[] as jsonb.

create table if not exists conversation_sessions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  messages    jsonb not null default '[]'::jsonb,   -- AI SDK ModelMessage[]
  summary     text,                                 -- carried-over brief; null until rotated
  token_count integer not null default 0,           -- context tokens of the last turn
  ended_at    timestamptz,                          -- null = active/unfinished
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- "Most recent active session" marker. The partial unique index guarantees at most one active
-- session per profile, so a racing insert fails rather than creating a duplicate (acceptable
-- for v1's single-instance, sequential-per-user webhook flow).
create unique index if not exists conversation_sessions_one_active_idx
  on conversation_sessions (profile_id) where ended_at is null;

create index if not exists conversation_sessions_profile_id_idx on conversation_sessions (profile_id);
