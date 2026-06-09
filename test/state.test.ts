import { describe, it, expect, vi, afterEach } from "vitest";
import {
  signStartLink,
  verifyStartLink,
  createOAuthState,
  verifyOAuthState,
} from "../src/auth/state.js";

afterEach(() => vi.useRealTimers());

describe("start link signing", () => {
  it("verifies a sig issued for the same uid", () => {
    const sig = signStartLink("42");
    expect(verifyStartLink("42", sig)).toBe(true);
  });

  it("rejects a sig for a different uid or a tampered sig", () => {
    const sig = signStartLink("42");
    expect(verifyStartLink("43", sig)).toBe(false);
    expect(verifyStartLink("42", `${sig}x`)).toBe(false);
  });
});

describe("oauth state", () => {
  it("round-trips the uid", () => {
    const state = createOAuthState("99");
    expect(verifyOAuthState(state)?.uid).toBe("99");
  });

  it("rejects tampered or malformed state", () => {
    const state = createOAuthState("99");
    expect(verifyOAuthState(`${state.slice(0, -2)}zz`)).toBeNull();
    expect(verifyOAuthState("not-a-real-state")).toBeNull();
    expect(verifyOAuthState("")).toBeNull();
  });

  it("rejects expired state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const state = createOAuthState("7");
    // Advance past the 10-minute TTL.
    vi.setSystemTime(new Date("2026-01-01T00:11:00Z"));
    expect(verifyOAuthState(state)).toBeNull();
  });
});
