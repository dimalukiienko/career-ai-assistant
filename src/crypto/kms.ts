import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import type { Encryptor } from "./encryptor.js";

/**
 * Production encryptor: envelope encryption.
 *   - A fresh 32-byte data-encryption key (DEK) encrypts the plaintext locally (AES-256-GCM).
 *   - Cloud KMS wraps the DEK with the key-encryption key (KEK) named by KMS_KEY_NAME.
 * Only the wrapped DEK + ciphertext are stored; the DEK never persists in the clear.
 *
 * Blob format: `v1:kms:<wrappedDek>:<iv>:<tag>:<ciphertext>` (base64 parts).
 * The runtime service account needs roles/cloudkms.cryptoKeyEncrypterDecrypter.
 */
export class KmsEnvelopeEncryptor implements Encryptor {
  readonly scheme = "kms";
  private readonly client: KeyManagementServiceClient;

  constructor(private readonly keyName: string) {
    this.client = new KeyManagementServiceClient();
  }

  async encrypt(plaintext: string): Promise<string> {
    const dek = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", dek, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    const [wrap] = await this.client.encrypt({ name: this.keyName, plaintext: dek });
    if (!wrap.ciphertext) throw new Error("KMS encrypt returned no ciphertext");
    const wrappedDek = Buffer.from(wrap.ciphertext as Uint8Array);

    return [
      "v1",
      "kms",
      wrappedDek.toString("base64"),
      iv.toString("base64"),
      tag.toString("base64"),
      ciphertext.toString("base64"),
    ].join(":");
  }

  async decrypt(blob: string): Promise<string> {
    const parts = blob.split(":");
    if (parts.length !== 6 || parts[0] !== "v1" || parts[1] !== "kms") {
      throw new Error("KmsEnvelopeEncryptor: unrecognized blob format");
    }
    const [, , wrappedB64, ivB64, tagB64, ctB64] = parts as [
      string, string, string, string, string, string,
    ];

    const [unwrap] = await this.client.decrypt({
      name: this.keyName,
      ciphertext: Buffer.from(wrappedB64, "base64"),
    });
    if (!unwrap.plaintext) throw new Error("KMS decrypt returned no plaintext");
    const dek = Buffer.from(unwrap.plaintext as Uint8Array);

    const decipher = createDecipheriv("aes-256-gcm", dek, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}
