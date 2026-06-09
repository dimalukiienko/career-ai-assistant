# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Telegram webhook bot + AI agent (Vercel AI SDK, OpenAI) that reads a user's Google
Calendar and Gmail (read-only, OAuth) for job-search help. Single service, deploys to
Cloud Run. Scope is deliberately minimal v1 — no Notion, no billing.

## Commands

```bash
pnpm dev                       # tsx watch, serves on PORT (default 8080)
pnpm test                      # vitest (all)
npx vitest run test/state.test.ts        # single file
npx vitest run -t "expired state"        # single test by name
pnpm typecheck                 # tsc over src + test + scripts (uses tsconfig.check.json)
pnpm build                     # tsc emit to dist/ (src only, tsconfig.json)
pnpm set-webhook               # register Telegram webhook at ${PUBLIC_URL}/telegram/webhook
pnpm set-webhook --clear       # remove it
```

`pnpm build` uses `tsconfig.json` (emits `src/` only). `pnpm typecheck` uses
`tsconfig.check.json` (no emit, also covers `test/` + `scripts/`). When checking types,
prefer `pnpm typecheck` — `tsc -p tsconfig.json` skips tests/scripts.

## Hard requirements when editing

- **ESM + NodeNext:** every relative import MUST end in `.js` (even though the source is
  `.ts`), e.g. `import { env } from "../config/env.js"`. Omitting the extension breaks the build.
- **Env is validated at import time.** `src/config/env.ts` parses `process.env` with zod and
  throws on missing/invalid vars. Any entrypoint must `import "./config/bootstrap-env.js"`
  as its FIRST import (it calls `process.loadEnvFile` for local `.env`; no-op in prod).
  Tests get env from `test/setup-env.ts` (a vitest `setupFiles`).
- **Google OAuth2 client type:** use `GoogleAuthClient` (`= ReturnType<typeof
  createOAuthClient>`, exported from `src/google/oauth.ts`), NOT `Auth.OAuth2Client`. Two
  `google-auth-library` versions coexist in the tree and clash on a private property.
- **pnpm 11 quirk:** native build scripts are gated by `pnpm.onlyBuiltDependencies`
  (`esbuild`, `protobufjs`) in `package.json`; `.npmrc` sets `verify-deps-before-run=false`
  so script runs don't fail on the ignored-builds warning. After dep changes, run
  `pnpm rebuild esbuild protobufjs` if esbuild/vitest misbehaves.

## Architecture (the parts that span files)

**Composition root — `src/deps.ts`.** `getDeps()` builds the only process-wide singletons:
`encryptor`, `profiles` (ProfileStore), `tokens` (TokenStore), `sessions` (SessionStore).
These are **interfaces** chosen here; `profiles`/`tokens` use Supabase impls
(`SupabaseProfileStore`, `SupabaseTokenStore` over one `createClient<Database>`), `sessions`
is still in-memory. Nothing else imports a concrete store, so swapping `sessions` to Supabase
later = add an impl and change this one file. In-memory impls (`InMemory*`) remain as the test
seam (`test/tools.test.ts`).

**Request flow.** `src/index.ts` → `createApp(deps, bot)` (`src/server/app.ts`) mounts three
route groups: health (`/`), Telegram webhook (`/telegram/webhook`, grammY `webhookCallback`
with secret-token verification), and Google OAuth (`/oauth/google/{start,callback}`).
Text messages → `src/bot/bot.ts` → `runAgent` (`src/agent/agent.ts`).

**Agent loop.** `runAgent` calls AI SDK `generateText` with `stopWhen: stepCountIs(AGENT_MAX_STEPS)`
and tools from `buildTools(userCtx, deps)`. The system prompt injects current date/time +
timezone so the model resolves relative dates itself. Conversation history persists via the
SessionStore (trimmed). Model is OpenAI-only, id from `OPENAI_MODEL`.

**Tools — `src/agent/tools/`.** Each tool closes over `userCtx = { uid, oauthUrl }` and
`deps`. On every call it does `getAuthedClient(uid, deps)`; if the user has no stored tokens
it returns `needsAuth(ctx)` → `{ status: "needs_auth", authUrl, message }`. The system prompt
tells the model to relay that `authUrl` to the user. This is how "not connected → send OAuth
link in chat" works — there is no pre-check; the tool result drives it.

**OAuth + signing — `src/auth/state.ts`.** Two HMAC-signed artifacts keyed off
`OAUTH_STATE_SECRET`: (1) the bot "start link" carries `?u=<uid>&sig=<hmac>` so
`/oauth/google/start` confirms the request came from our bot before redirecting to Google;
(2) the OAuth `state` is a fresh signed `{uid,nonce,exp}` (10-min TTL) minted at `/start` and
verified at `/callback`. The callback exchanges the code, reads the account email from the
`id_token` (`emailFromIdToken`), **encrypts the refresh token via the Encryptor**, and stores
the connection.

**Persistence — Supabase.** Two tables (`supabase/migrations/0001_init.sql`): `profiles`
(Telegram identity, keyed by unique `telegram_id`; metadata upserted from a bot middleware on
every interaction) and `google_connections` (FK → profiles, `refresh_token_enc` as **text**,
`scopes text[]`, `google_email`, soft-revoke via `revoked_at`). `SupabaseTokenStore` maps
`uid` (Telegram id) → profile → connection; `delete` is a soft revoke and `get` ignores
revoked rows. Access tokens are **not** persisted (the Google client refreshes on demand).
Schema types are in `src/types/database.types.ts` (generated by `pnpm generate:types` from
the linked project; rerun after any migration). RLS is off — only the backend (service_role key)
touches the DB.

**Token encryption — `src/crypto/`.** `getEncryptor()` returns `KmsEnvelopeEncryptor` when
`KMS_KEY_NAME` is set (random DEK encrypts the token via AES-256-GCM; Cloud KMS wraps the
DEK), else `LocalEncryptor` (dev, single AES key from `LOCAL_ENCRYPTION_KEY`). Blobs are
self-describing (`v1:kms:...` / `v1:local:...`) and stored as text. `getAuthedClient`
(`src/google/client.ts`) decrypts the refresh token, builds the OAuth2 client, and persists a
rotated refresh token (rare) via the `tokens` event.

## v1 constraints (deliberate, documented in README)

- **Sessions** are still **in-memory** → conversation history is per-instance and lost on
  cold start. Tokens/profiles now persist in Supabase, so re-auth survives restarts. Keep
  Cloud Run at `min/max-instances=1` until sessions move to a shared store too.
- `gmail.readonly` is a Google **restricted scope**: fine with test users, needs app
  verification before public launch. (`openid`/`userinfo.email` are non-restricted.)
- The agent runs inline in the webhook handler (fine for v1; queue later if latency grows).
