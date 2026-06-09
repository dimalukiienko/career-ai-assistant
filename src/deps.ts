import { getEncryptor } from "./crypto/encryptor.js";
import { InMemoryTokenStore, type TokenStore } from "./storage/tokens.js";
import { InMemorySessionStore, type SessionStore } from "./storage/sessions.js";
import type { Encryptor } from "./crypto/encryptor.js";

/**
 * Composition root: the single place process-wide singletons are constructed. Swapping an
 * in-memory store for Supabase later means changing only this file.
 *
 * NOTE (v1): stores are in-memory, so tokens/sessions live in one instance's RAM and are
 * lost on cold start. Run Cloud Run at min/max-instances=1 until a shared store lands.
 */
export interface Deps {
  encryptor: Encryptor;
  tokens: TokenStore;
  sessions: SessionStore;
}

let cached: Deps | undefined;

export function getDeps(): Deps {
  if (!cached) {
    cached = {
      encryptor: getEncryptor(),
      tokens: new InMemoryTokenStore(),
      sessions: new InMemorySessionStore(),
    };
  }
  return cached;
}
