/**
 * Encryption seam. Tokens are encrypted before they ever touch a store, so swapping
 * the in-memory store for Supabase later never exposes plaintext refresh tokens.
 *
 * Implementations produce a self-describing string blob (scheme prefix included) so the
 * matching decryptor can validate what it was handed.
 */
export interface Encryptor {
  /** The scheme tag this encryptor produces (e.g. "local", "kms"). */
  readonly scheme: string;
  encrypt(plaintext: string): Promise<string>;
  decrypt(blob: string): Promise<string>;
}

import { env } from "../config/env.js";
import { LocalEncryptor } from "./local.js";
import { KmsEnvelopeEncryptor } from "./kms.js";

let cached: Encryptor | undefined;

/** Returns the process-wide encryptor: KMS when KMS_KEY_NAME is set, else local AES. */
export function getEncryptor(): Encryptor {
  if (cached) return cached;
  cached = env.KMS_KEY_NAME
    ? new KmsEnvelopeEncryptor(env.KMS_KEY_NAME)
    : new LocalEncryptor(env.LOCAL_ENCRYPTION_KEY!);
  return cached;
}
