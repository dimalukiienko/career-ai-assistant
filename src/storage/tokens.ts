/**
 * A user's Google OAuth connection. The long-lived `refreshTokenEnc` is always stored
 * encrypted (see crypto/Encryptor). Access tokens are intentionally NOT persisted — the
 * Google client refreshes a short-lived one on demand from the refresh token.
 */
export interface StoredGoogleConnection {
  refreshTokenEnc: string;
  /** The connected Google account's email, when known (from the OAuth id_token). */
  googleEmail: string | null;
  /** Granted OAuth scopes. */
  scopes: string[];
}

/**
 * Storage seam for Google connections, keyed by Telegram uid (string). The in-memory impl
 * below is the test seam; the Supabase impl (supabase-tokens.ts) is the runtime default and
 * maps uid → profile → connection internally.
 */
export interface TokenStore {
  get(uid: string): Promise<StoredGoogleConnection | null>;
  set(uid: string, conn: StoredGoogleConnection): Promise<void>;
  /** Revoke the user's connection (soft delete). */
  delete(uid: string): Promise<void>;
}

export class InMemoryTokenStore implements TokenStore {
  private readonly map = new Map<string, StoredGoogleConnection>();

  async get(uid: string): Promise<StoredGoogleConnection | null> {
    return this.map.get(uid) ?? null;
  }

  async set(uid: string, conn: StoredGoogleConnection): Promise<void> {
    this.map.set(uid, conn);
  }

  async delete(uid: string): Promise<void> {
    this.map.delete(uid);
  }
}
