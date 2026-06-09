# Career AI Assistant

A Telegram bot, backed by an AI agent, that reads your **Google Calendar** and **Gmail**
(read-only, via OAuth) to help with your job search. Runs as a single webhook service on
**Google Cloud Run**.

Ask it things like:

- "What's on my calendar tomorrow?"
- "Summarize my emails from last week."
- "Any recruiter emails in the last 7 days?"

The first time a tool needs Google access, the bot sends you a link to connect your account.

## Stack

- **Hono** + `@hono/node-server` — HTTP server (Telegram webhook + OAuth routes)
- **grammY** — Telegram bot (`webhookCallback`, secret-token verified)
- **Vercel AI SDK** (`ai` + `@ai-sdk/openai`) — agent loop (`generateText` + `stopWhen`)
- **googleapis** — Gmail + Calendar
- **Cloud KMS** — envelope encryption for refresh tokens

Tokens + profiles persist in **Supabase** (Postgres); conversation **sessions** are still
in-memory, behind the `SessionStore` interface so a Supabase backend can be dropped in later.
See [Limitations](#limitations).

## Architecture

```
Telegram ──webhook──▶ Hono ──▶ grammY ──▶ agent (AI SDK + OpenAI)
                        │                      └─ tools: list_calendar_events,
                        │                                list_emails, get_email
                        └─ /oauth/google/start ──▶ Google consent ──▶ /oauth/google/callback
                                                                         └─ encrypt + store tokens
```

Source map: `src/config` (env), `src/crypto` (Encryptor seam), `src/storage` (stores),
`src/auth/state.ts` (signed OAuth state), `src/google` (OAuth + API helpers),
`src/agent` (model, tools, loop), `src/bot`, `src/server` (routes), `src/index.ts` (entry).

## Setup

1. **Telegram:** create a bot with [@BotFather](https://t.me/BotFather), grab the token.
2. **Google Cloud:** create an OAuth 2.0 Client (type: Web application). Add
   `${PUBLIC_URL}/oauth/google/callback` as an authorized redirect URI. Enable the
   **Gmail API** and **Google Calendar API**. While unverified, add yourself as a test user.
3. **Supabase:** create a project. Authenticate the CLI once with `pnpm supabase login`
   (interactive — opens a browser), then apply `supabase/migrations/0001_init.sql` (via
   `pnpm supabase link && pnpm supabase db push`, or paste it into the SQL editor). Copy the
   project URL → `SUPABASE_URL` and the **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`
   (server-side secret). The committed `src/types/database.types.ts` is generated from this
   schema with `pnpm generate:types` (run it again after any migration change).
4. Copy env and fill it in:

   ```bash
   cp .env.example .env
   # generate secrets:
   node -e "console.log('TELEGRAM_WEBHOOK_SECRET=' + require('crypto').randomBytes(24).toString('base64url'))"
   node -e "console.log('OAUTH_STATE_SECRET=' + require('crypto').randomBytes(24).toString('base64url'))"
   node -e "console.log('LOCAL_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
   ```

5. Install: `pnpm install`

The model is set by `OPENAI_MODEL` (OpenAI only). Encryption uses **Cloud KMS** when
`KMS_KEY_NAME` is set, otherwise the dev-only `LOCAL_ENCRYPTION_KEY`.

## Run locally

Cloud Run / Telegram need a public HTTPS URL, so tunnel to your local port. Pick one:

```bash
pnpm dev                                   # starts on :8080, in one shell

# Option A — cloudflared: zero setup, no login required
cloudflared tunnel --url http://localhost:8080   # in another shell; copy the https URL

# Option B — ngrok: requires a (free) account + `ngrok config add-authtoken <token>` once
ngrok http 8080                                  # copy the https URL
```

**Which to use?** `cloudflared` needs no account, but its URL changes on every restart —
so you'd have to update the OAuth redirect URI in your Google client each time. `ngrok`
requires a one-time login, but on the free plan you can claim a **static domain**
(`ngrok http --url=<your-name>.ngrok-free.app 8080`) that survives restarts, so you set the
Google redirect URI once. Prefer `ngrok` if you'll be restarting often.

Set `PUBLIC_URL` in `.env` to the tunnel URL (and add `${PUBLIC_URL}/oauth/google/callback`
to your Google client), then register the webhook and message your bot:

```bash
pnpm set-webhook        # points Telegram at ${PUBLIC_URL}/telegram/webhook
pnpm set-webhook --clear  # to remove it
```

## Test / typecheck / build

```bash
pnpm test         # vitest
pnpm typecheck    # tsc (src + test + scripts)
pnpm build        # emits dist/
```

## Deploy to Cloud Run

```bash
gcloud run deploy career-ai-assistant \
  --source . --region <REGION> --allow-unauthenticated \
  --min-instances 1 --max-instances 1 \
  --set-env-vars "PUBLIC_URL=https://<service-url>,OPENAI_MODEL=gpt-4.1-mini,KMS_KEY_NAME=projects/.../cryptoKeys/<key>" \
  --set-env-vars "SUPABASE_URL=https://<project>.supabase.co" \
  --set-secrets "TELEGRAM_BOT_TOKEN=...,TELEGRAM_WEBHOOK_SECRET=...,OPENAI_API_KEY=...,GOOGLE_CLIENT_ID=...,GOOGLE_CLIENT_SECRET=...,OAUTH_STATE_SECRET=...,SUPABASE_SERVICE_ROLE_KEY=..."
```

Grant the runtime service account KMS access:

```bash
gcloud kms keys add-iam-policy-binding <key> \
  --keyring <ring> --location <loc> \
  --member "serviceAccount:<runtime-sa>" \
  --role roles/cloudkms.cryptoKeyEncrypterDecrypter
```

Then point `PUBLIC_URL` at the deployed URL and run `pnpm set-webhook` (with that
`PUBLIC_URL`). `GET /` is the health check.

## Limitations (v1)

- **In-memory sessions:** conversation history lives in one instance's RAM — lost on cold
  start and not shared across instances. Tokens + profiles persist in Supabase, so re-auth
  survives restarts; keep `min/max-instances=1` until sessions move to a shared store too.
  The `SessionStore` interface is the remaining swap point.
- **`gmail.readonly` is a restricted scope:** fine with test users; requires Google app
  verification before a public launch.
- The agent runs inline in the webhook handler. Fine for v1; move to a queue if latency grows.
