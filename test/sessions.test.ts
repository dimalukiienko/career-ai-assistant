import { describe, it, expect } from "vitest";
import type { ModelMessage } from "ai";
import { InMemorySessionStore } from "../src/storage/sessions.js";

const user = (text: string): ModelMessage => ({ role: "user", content: text });

describe("InMemorySessionStore", () => {
  it("lazily creates an empty active session", async () => {
    const store = new InMemorySessionStore();
    const active = await store.getActive("u1");
    expect(active.messages).toEqual([]);
    expect(active.summary).toBeNull();
    expect(active.tokenCount).toBe(0);
    expect(active.id).toBeTruthy();
  });

  it("accumulates messages and records the latest token count", async () => {
    const store = new InMemorySessionStore();
    await store.append("u1", [user("hi")], 100);
    await store.append("u1", [user("again")], 250);

    const active = await store.getActive("u1");
    expect(active.messages).toEqual([user("hi"), user("again")]);
    expect(active.tokenCount).toBe(250);
  });

  it("isolates sessions per user", async () => {
    const store = new InMemorySessionStore();
    await store.append("u1", [user("for u1")], 10);
    const u2 = await store.getActive("u2");
    expect(u2.messages).toEqual([]);
  });

  it("reset clears the active session", async () => {
    const store = new InMemorySessionStore();
    await store.append("u1", [user("hi")], 100);
    await store.reset("u1");
    const active = await store.getActive("u1");
    expect(active.messages).toEqual([]);
    expect(active.tokenCount).toBe(0);
    expect(active.summary).toBeNull();
  });

  it("rotateWithSummary starts a fresh session carrying the summary", async () => {
    const store = new InMemorySessionStore();
    await store.append("u1", [user("a long chat")], 9000);
    await store.rotateWithSummary("u1", "user is prepping for interviews next week");

    const active = await store.getActive("u1");
    expect(active.messages).toEqual([]);
    expect(active.tokenCount).toBe(0);
    expect(active.summary).toBe("user is prepping for interviews next week");
  });

  it("returns a copy of messages (mutating the result does not leak back)", async () => {
    const store = new InMemorySessionStore();
    await store.append("u1", [user("hi")], 10);
    const active = await store.getActive("u1");
    active.messages.push(user("mutation"));
    const again = await store.getActive("u1");
    expect(again.messages).toEqual([user("hi")]);
  });
});
