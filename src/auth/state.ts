import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Signed values for the OAuth handshake, all keyed off OAUTH_STATE_SECRET:
 *
 *  - Bot "start" links carry `?u=<uid>&sig=<hmac(uid)>` so /oauth/google/start can confirm
 *    the request really originated from our bot before kicking off consent.
 *  - The OAuth `state` param is a fresh signed `{uid,nonce,exp}` minted at /start and
 *    verified at /callback (binds the redirect to a user, prevents replay/CSRF).
 */
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function hmac(input: string): string {
  return createHmac("sha256", env.OAUTH_STATE_SECRET).update(input).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Signature embedded in the bot-issued start link for a user. */
export function signStartLink(uid: string): string {
  return hmac(`start:${uid}`);
}

export function verifyStartLink(uid: string, sig: string): boolean {
  return safeEqual(sig, signStartLink(uid));
}

/** Full, signed link the bot sends in chat to begin Google OAuth for a user. */
export function buildStartUrl(uid: string): string {
  const params = new URLSearchParams({ u: uid, sig: signStartLink(uid) });
  return `${env.PUBLIC_URL}/oauth/google/start?${params.toString()}`;
}

interface StatePayload {
  uid: string;
  nonce: string;
  exp: number;
}

/** Mint a fresh, signed OAuth `state` for this user. */
export function createOAuthState(uid: string): string {
  const payload: StatePayload = {
    uid,
    nonce: randomBytes(8).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${hmac(body)}`;
}

/** Verify an OAuth `state` and return the bound uid, or null if invalid/expired/tampered. */
export function verifyOAuthState(state: string): { uid: string } | null {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  if (!safeEqual(sig, hmac(body))) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return { uid: payload.uid };
  } catch {
    return null;
  }
}
