import { describe, it, expect } from "vitest";
import { createApp } from "../src/server/app.js";
import { createBot } from "../src/bot/bot.js";
import { getDeps } from "../src/deps.js";
import { signStartLink } from "../src/auth/state.js";

const deps = getDeps();
const app = createApp(deps, createBot(deps));

describe("routes", () => {
  it("health check returns ok", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("oauth start rejects a bad/missing signature", async () => {
    expect((await app.request("/oauth/google/start")).status).toBe(400);
    expect((await app.request("/oauth/google/start?u=1&sig=nope")).status).toBe(400);
  });

  it("oauth start redirects to Google consent for a valid signature", async () => {
    const sig = signStartLink("1");
    const res = await app.request(`/oauth/google/start?u=1&sig=${sig}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location") ?? "").toContain("accounts.google.com");
  });

  it("oauth callback rejects an invalid state", async () => {
    const res = await app.request("/oauth/google/callback?code=abc&state=bad");
    expect(res.status).toBe(400);
  });
});
