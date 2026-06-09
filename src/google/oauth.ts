import { google } from "googleapis";
import { env } from "../config/env.js";
import { GOOGLE_SCOPES } from "./scopes.js";

/** A bare OAuth2 client configured with our app credentials + redirect URI. */
export function createOAuthClient() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.googleRedirectUri,
  );
}

/** The concrete OAuth2 client type, derived from the factory to avoid version-skew typing. */
export type GoogleAuthClient = ReturnType<typeof createOAuthClient>;

/** Consent-screen URL. `offline` + `consent` ensures we always receive a refresh token. */
export function buildAuthUrl(state: string): string {
  return createOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...GOOGLE_SCOPES],
    state,
    include_granted_scopes: true,
  });
}

/** Exchange an authorization code for tokens (includes refresh_token on first consent). */
export async function exchangeCode(code: string) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/**
 * Read the `email` claim from a Google id_token. The token comes straight from Google over
 * TLS in our own code exchange, so we decode the JWT payload without re-verifying the
 * signature. Returns null if absent or unparseable.
 */
export function emailFromIdToken(idToken?: string | null): string | null {
  if (!idToken) return null;
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
    };
    return claims.email ?? null;
  } catch {
    return null;
  }
}
