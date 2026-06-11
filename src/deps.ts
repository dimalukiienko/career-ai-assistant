import { createClient } from "@supabase/supabase-js";
import { env } from "./config/env.js";
import { getEncryptor } from "./crypto/encryptor.js";
import type { Encryptor } from "./crypto/encryptor.js";
import type { Database } from "./types/database.types.js";
import type { SessionStore } from "./storage/sessions.js";
import type { TokenStore } from "./storage/tokens.js";
import type { ProfileStore } from "./storage/profiles.js";
import type { UsageStore } from "./storage/usage.js";
import type { ApplicationStore } from "./storage/applications.js";
import type { UpdateDedupStore } from "./storage/updates.js";
import { SupabaseProfileStore } from "./storage/supabase-profiles.js";
import { SupabaseTokenStore } from "./storage/supabase-tokens.js";
import { SupabaseSessionStore } from "./storage/supabase-sessions.js";
import { SupabaseUsageStore } from "./storage/supabase-usage.js";
import { SupabaseApplicationStore } from "./storage/supabase-applications.js";
import { SupabaseUpdateDedupStore } from "./storage/supabase-updates.js";

/**
 * Composition root: the single place process-wide singletons are constructed.
 *
 * NOTE (v1): tokens, profiles, and now conversation sessions are all persisted in Supabase,
 * so they survive cold starts. The InMemory* impls remain as the test seam.
 */
export interface Deps {
  encryptor: Encryptor;
  profiles: ProfileStore;
  tokens: TokenStore;
  sessions: SessionStore;
  usage: UsageStore;
  applications: ApplicationStore;
  /** Idempotency guard so a redelivered Telegram update isn't processed twice. */
  updates: UpdateDedupStore;
}

let cached: Deps | undefined;

export function getDeps(): Deps {
  if (!cached) {
    const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const profiles = new SupabaseProfileStore(supabase);
    cached = {
      encryptor: getEncryptor(),
      profiles,
      tokens: new SupabaseTokenStore(supabase, profiles),
      sessions: new SupabaseSessionStore(supabase, profiles),
      usage: new SupabaseUsageStore(supabase, profiles),
      applications: new SupabaseApplicationStore(supabase, profiles),
      updates: new SupabaseUpdateDedupStore(supabase),
    };
  }
  return cached;
}
