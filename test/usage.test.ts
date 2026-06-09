import { describe, it, expect } from "vitest";
import { InMemoryUsageStore } from "../src/storage/usage.js";

describe("InMemoryUsageStore", () => {
  it("returns zeros for a user with no usage", async () => {
    const store = new InMemoryUsageStore();
    expect(await store.total("u1")).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  });

  it("accumulates usage across calls (agent turns + summarization)", async () => {
    const store = new InMemoryUsageStore();
    await store.record("u1", { inputTokens: 100, outputTokens: 20, totalTokens: 120 });
    await store.record("u1", { inputTokens: 300, outputTokens: 50, totalTokens: 350 }); // e.g. a summarization
    expect(await store.total("u1")).toEqual({ inputTokens: 400, outputTokens: 70, totalTokens: 470 });
  });

  it("tracks users independently", async () => {
    const store = new InMemoryUsageStore();
    await store.record("u1", { inputTokens: 100, outputTokens: 20, totalTokens: 120 });
    await store.record("u2", { inputTokens: 5, outputTokens: 5, totalTokens: 10 });
    expect((await store.total("u1")).totalTokens).toBe(120);
    expect((await store.total("u2")).totalTokens).toBe(10);
  });
});
