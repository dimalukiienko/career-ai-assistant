import { describe, it, expect } from "vitest";
import { InMemoryUpdateDedupStore } from "../src/storage/updates.js";

describe("InMemoryUpdateDedupStore", () => {
  it("claims an id once and rejects the redelivery", async () => {
    const store = new InMemoryUpdateDedupStore();
    expect(await store.claim(1001)).toBe(true);
    expect(await store.claim(1001)).toBe(false);
  });

  it("treats distinct update ids independently", async () => {
    const store = new InMemoryUpdateDedupStore();
    expect(await store.claim(1)).toBe(true);
    expect(await store.claim(2)).toBe(true);
    expect(await store.claim(1)).toBe(false);
  });
});
