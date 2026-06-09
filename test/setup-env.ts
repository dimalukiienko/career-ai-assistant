import { randomBytes } from "node:crypto";

// Minimal valid env so importing modules that read `env` doesn't throw during tests.
process.env.PUBLIC_URL ??= "https://example.com";
process.env.TELEGRAM_BOT_TOKEN ??= "123456:test-token";
process.env.TELEGRAM_WEBHOOK_SECRET ??= "test-webhook-secret";
process.env.OPENAI_API_KEY ??= "sk-test";
process.env.OPENAI_MODEL ??= "gpt-4.1-mini";
process.env.GOOGLE_CLIENT_ID ??= "test-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";
process.env.OAUTH_STATE_SECRET ??= "test-oauth-state-secret-0123456789";
process.env.LOCAL_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
