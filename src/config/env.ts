import { z } from "zod";

/**
 * Centralized, validated configuration. Importing `env` from here guarantees the
 * process fails fast at startup with a clear message if anything required is missing.
 */
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  PUBLIC_URL: z
    .string()
    .url()
    .transform((u) => u.replace(/\/+$/, "")),

  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1, "TELEGRAM_WEBHOOK_SECRET is required"),

  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  AGENT_MAX_STEPS: z.coerce.number().int().positive().max(50).default(8),

  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  OAUTH_STATE_SECRET: z.string().min(16, "OAUTH_STATE_SECRET must be at least 16 chars"),

  // Supabase (persistent token storage). Service-role key — server-side only, keep secret.
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),

  // Token encryption: KMS when KMS_KEY_NAME is set, else LOCAL_ENCRYPTION_KEY.
  KMS_KEY_NAME: z.string().optional(),
  LOCAL_ENCRYPTION_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema> & {
  /** Effective Google OAuth redirect URI (derived from PUBLIC_URL when unset). */
  googleRedirectUri: string;
};

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const e = parsed.data;

  if (!e.KMS_KEY_NAME && !e.LOCAL_ENCRYPTION_KEY) {
    throw new Error("Token encryption is not configured: set KMS_KEY_NAME (production) or LOCAL_ENCRYPTION_KEY (dev).");
  }

  return {
    ...e,
    googleRedirectUri: e.GOOGLE_REDIRECT_URI || `${e.PUBLIC_URL}/oauth/google/callback`,
  };
}

export const env: Env = load();
