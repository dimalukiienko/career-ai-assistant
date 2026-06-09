import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { LocalEncryptor } from "../src/crypto/local.js";

describe("LocalEncryptor", () => {
  const key = randomBytes(32).toString("base64");

  it("round-trips plaintext", async () => {
    const enc = new LocalEncryptor(key);
    const secret = "1//refresh-token-value-äöü";
    const blob = await enc.encrypt(secret);
    expect(blob.startsWith("v1:local:")).toBe(true);
    expect(blob).not.toContain(secret);
    expect(await enc.decrypt(blob)).toBe(secret);
  });

  it("produces a fresh IV each time (non-deterministic ciphertext)", async () => {
    const enc = new LocalEncryptor(key);
    const a = await enc.encrypt("same");
    const b = await enc.encrypt("same");
    expect(a).not.toBe(b);
  });

  it("rejects a key that is not 32 bytes", () => {
    expect(() => new LocalEncryptor(randomBytes(16).toString("base64"))).toThrow();
  });

  it("fails to decrypt a tampered blob", async () => {
    const enc = new LocalEncryptor(key);
    const blob = await enc.encrypt("data");
    const tampered = `${blob.slice(0, -3)}AAA`;
    await expect(enc.decrypt(tampered)).rejects.toThrow();
  });
});
