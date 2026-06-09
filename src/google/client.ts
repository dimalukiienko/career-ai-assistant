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
    scope: stored.scopes.join(" "),
  });

  // Access tokens aren't persisted (the library fetches them on demand). We only care about
  // a rotated refresh token, which Google issues rarely — re-encrypt and store it when it does.
  client.on("tokens", (t: Auth.Credentials) => {
    const rotated = t.refresh_token;
    if (!rotated) return;
    void (async () => {
      try {
        const current = await deps.tokens.get(uid);
        if (!current) return;
        await deps.tokens.set(uid, {
          ...current,
          refreshTokenEnc: await deps.encryptor.encrypt(rotated),
        });
      } catch (err) {
        console.error(`[google] failed to persist rotated refresh token for ${uid}:`, err);
      }
    })();
  });

  return client;
}
