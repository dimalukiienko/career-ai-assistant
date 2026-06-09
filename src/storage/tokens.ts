/**
 * Per-user Google OAuth credentials. The long-lived `refreshTokenEnc` is always stored
 * encrypted (see crypto/Encryptor); the short-lived access token + expiry are cached so
 * we avoid a refresh round-trip on every call.
 */
export interface StoredGoogleTokens {
  refreshTokenEnc: string;
  accessToken?: string;
  /** Epoch millis when the access token expires. */
  expiryDate?: number;
  scope?: string;
  tokenType?: string;
}

/**
 * Storage seam for Google tokens. The in-memory impl below is the v1 default; a Supabase
 * impl can be dropped in later with no changes to callers.
 */
export interface TokenStore {
  get(uid: string): Promise<StoredGoogleTokens | null>;
  set(uid: string, tokens: StoredGoogleTokens): Promise<void>;
  delete(uid: string): Promise<void>;
}

export class InMemoryTokenStore implements TokenStore {
  private readonly map = new Map<string, StoredGoogleTokens>();

  async get(uid: string): Promise<StoredGoogleTokens | null> {
    return this.map.get(uid) ?? null;
  }

  async set(uid: string, tokens: StoredGoogleTokens): Promise<void> {
    this.map.set(uid, tokens);
  }

  async delete(uid: string): Promise<void> {
    this.map.delete(uid);
  }
}
