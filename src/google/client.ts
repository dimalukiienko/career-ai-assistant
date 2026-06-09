import type { Auth } from "googleapis";
import type { Deps } from "../deps.js";
import { createOAuthClient, type GoogleAuthClient } from "./oauth.js";

/**
 * Build an authenticated OAuth2 client for a user from stored tokens, or return null if
 * the user hasn't connected Google. The client auto-refreshes the access token using the
 * (decrypted) refresh token; refreshed access tokens are persisted back to the store.
 */
export async function getAuthedClient(
  uid: string,
  deps: Deps,
): Promise<GoogleAuthClient | null> {
  const stored = await deps.tokens.get(uid);
  if (!stored) return null;

  const refreshToken = await deps.encryptor.decrypt(stored.refreshTokenEnc);
  const client = createOAuthClient();
  client.setCredentials({
    refresh_token: refreshToken,
    access_token: stored.accessToken,
    expiry_date: stored.expiryDate,
    scope: stored.scope,
    token_type: stored.tokenType,
  });

  // Persist rotated access tokens (and, rarely, a new refresh token) as they arrive.
  client.on("tokens", (t: Auth.Credentials) => {
    void (async () => {
      try {
        const current = await deps.tokens.get(uid);
        if (!current) return;
        await deps.tokens.set(uid, {
          ...current,
          accessToken: t.access_token ?? current.accessToken,
          expiryDate: t.expiry_date ?? current.expiryDate,
          scope: t.scope ?? current.scope,
          tokenType: t.token_type ?? current.tokenType,
          refreshTokenEnc: t.refresh_token
            ? await deps.encryptor.encrypt(t.refresh_token)
            : current.refreshTokenEnc,
        });
      } catch (err) {
        console.error(`[google] failed to persist refreshed tokens for ${uid}:`, err);
      }
    })();
  });

  return client;
}
