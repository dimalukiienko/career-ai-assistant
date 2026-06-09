-- Per-user cumulative token spend.
--
-- One running-total row per profile, covering every model call we make for the user — agent
-- turns and summarization alike. This is lifetime spend, distinct from
-- conversation_sessions.token_count (the current context size that drives rotation).
--
-- Increments go through add_token_usage() so they are atomic (insert-or-add in one statement),
-- avoiding the read-modify-write race two overlapping messages from the same user could hit.

create table if not exists token_usage (
  profile_id    uuid primary key references profiles(id) on delete cascade,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  total_tokens  bigint not null default 0,
  updated_at    timestamptz not null default now()
);

create or replace function add_token_usage(
  p_profile_id uuid,
  p_input bigint,
  p_output bigint,
  p_total bigint
) returns void
language sql
as $$
  insert into token_usage (profile_id, input_tokens, output_tokens, total_tokens, updated_at)
  values (p_profile_id, p_input, p_output, p_total, now())
  on conflict (profile_id) do update set
    input_tokens  = token_usage.input_tokens  + excluded.input_tokens,
    output_tokens = token_usage.output_tokens + excluded.output_tokens,
    total_tokens  = token_usage.total_tokens  + excluded.total_tokens,
    updated_at    = now();
$$;
