-- Job applications the user is tracking. One row per application, owned by a profile.
--
-- This is the first feature table that isn't plumbing (auth/sessions/usage): it holds the
-- user's actual job-search pipeline so the agent can create, list, update, and delete records
-- from chat. `status` walks the pipeline (saved -> applied -> ... -> accepted/rejected) and
-- `interview_stages` is a free-form ordered list of round names (e.g. phone screen, onsite).
--
-- Backend-only access (service_role), so RLS stays disabled like the other tables.

create type application_status as enum (
  'saved', 'applied', 'screening', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn'
);
create type work_mode as enum ('onsite', 'remote', 'hybrid');

create table if not exists applications (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references profiles(id) on delete cascade,
  status           application_status not null default 'saved',
  company          text not null,
  position         text,
  source           text,
  vacancy_url      text,
  location         text,
  work_mode        work_mode,
  salary_note      text,
  notes            text,
  interview_stages text[] not null default '{}',    -- ordered round names, e.g. ['phone screen', 'onsite']
  applied_at       timestamptz,                      -- set when the user actually applies
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists applications_profile_id_idx on applications (profile_id);
