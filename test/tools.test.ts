import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { calendarTools } from "../src/agent/tools/calendar.js";
import { gmailTools } from "../src/agent/tools/gmail.js";
import { LocalEncryptor } from "../src/crypto/local.js";
import { InMemoryTokenStore } from "../src/storage/tokens.js";
import { InMemorySessionStore } from "../src/storage/sessions.js";
import { InMemoryProfileStore } from "../src/storage/profiles.js";
import type { Deps } from "../src/deps.js";

function makeDeps(): Deps {
  return {
    encryptor: new LocalEncryptor(randomBytes(32).toString("base64")),
    profiles: new InMemoryProfileStore(),
    tokens: new InMemoryTokenStore(),
    sessions: new InMemorySessionStore(),
  };
}

// Minimal stub for the ToolCallOptions the AI SDK passes as the 2nd execute arg.
const callOpts = { toolCallId: "test", messages: [] } as never;

describe("tools without a connected Google account", () => {
  const ctx = { uid: "1", oauthUrl: "https://example.com/oauth/google/start?u=1&sig=abc" };

  it("list_calendar_events returns needs_auth with the link", async () => {
    const { list_calendar_events } = calendarTools(ctx, makeDeps());
    const res = await list_calendar_events.execute!(
      { timeMin: "2026-06-09T00:00:00Z", timeMax: "2026-06-10T00:00:00Z" },
      callOpts,
    );
    expect(res).toMatchObject({ status: "needs_auth", authUrl: ctx.oauthUrl });
  });

  it("list_emails returns needs_auth", async () => {
    const { list_emails } = gmailTools(ctx, makeDeps());
    const res = await list_emails.execute!({ after: "2026-06-01" }, callOpts);
    expect(res).toMatchObject({ status: "needs_auth", authUrl: ctx.oauthUrl });
  });
});
