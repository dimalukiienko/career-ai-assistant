-- Idempotency ledger for Telegram webhook deliveries.
--
-- The agent runs inline in the webhook handler, so a slow turn can exceed grammY's webhook
-- timeout; Telegram then redelivers the same update, which (without this guard) re-runs the
-- whole turn — duplicate tool calls, duplicate replies, duplicate records. Every Telegram
-- Update carries a globally-unique, monotonic `update_id`; we claim it here before doing any
-- work. The primary key makes the claim atomic: concurrent redeliveries race on the insert and
-- exactly one wins (the rest get a unique violation and are skipped).
--
-- Rows are tiny and write-once. They only matter inside Telegram's redelivery window (minutes,
-- well under a day), so a daily pg_cron job prunes anything older than a day to keep the table
-- bounded. Pruning is housekeeping, not correctness — a missed run just leaves stale rows.
--
-- Backend-only access (service_role), so RLS stays disabled like the other tables.

create table if not exists processed_updates (
  update_id  bigint primary key,
  created_at timestamptz not null default now()
);

-- Daily prune of expired idempotency rows. pg_cron is available on Supabase; cron.schedule is
-- keyed by job name, so re-running this migration just replaces the existing schedule.
create extension if not exists pg_cron;

select cron.schedule(
  'prune-processed-updates',
  '17 4 * * *', -- daily at 04:17 UTC, off the top-of-hour rush
  $$ delete from processed_updates where created_at < now() - interval '1 day' $$
);
