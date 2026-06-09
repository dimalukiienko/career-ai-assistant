import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Encryptor } from "./encryptor.js";

/**
 * Dev-only encryptor: AES-256-GCM with a single static key from LOCAL_ENCRYPTION_KEY
 * (base64-encoded 32 bytes). Blob format: `v1:local:<iv>:<tag>:<ciphertext>` (base64 parts).
 */
export class LocalEncryptor implements Encryptor {
  readonly scheme = "local";
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, "base64");
    if (key.length !== 32) {
      throw new Error(
        `LOCAL_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). ` +
          `Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
      );
    }
    this.key = key;
  }

  async encrypt(plaintext: string): Promise<string> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:local:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
  }

  async decrypt(blob: string): Promise<string> {
    const parts = blob.split(":");
    if (parts.length !== 5 || parts[0] !== "v1" || parts[1] !== "local") {
      throw new Error("LocalEncryptor: unrecognized blob format");
    }
    const [, , ivB64, tagB64, ctB64] = parts as [string, string, string, string, string];
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}
