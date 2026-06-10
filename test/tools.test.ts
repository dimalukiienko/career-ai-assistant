import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { applicationTools } from "../src/agent/tools/applications.js";
import { calendarTools } from "../src/agent/tools/calendar.js";
import { gmailTools } from "../src/agent/tools/gmail.js";
import { LocalEncryptor } from "../src/crypto/local.js";
import { InMemoryTokenStore } from "../src/storage/tokens.js";
import { InMemorySessionStore } from "../src/storage/sessions.js";
import { InMemoryProfileStore } from "../src/storage/profiles.js";
import { InMemoryUsageStore } from "../src/storage/usage.js";
import { InMemoryApplicationStore } from "../src/storage/applications.js";
import type { Deps } from "../src/deps.js";

function makeDeps(): Deps {
  return {
    encryptor: new LocalEncryptor(randomBytes(32).toString("base64")),
    profiles: new InMemoryProfileStore(),
    tokens: new InMemoryTokenStore(),
    sessions: new InMemorySessionStore(),
    usage: new InMemoryUsageStore(),
    applications: new InMemoryApplicationStore(),
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

describe("application tools (no Google auth needed)", () => {
  const ctx = { uid: "1", oauthUrl: "https://example.com/oauth/google/start?u=1&sig=abc" };

  it("creates, lists (filtered), updates, gets, and deletes an application", async () => {
    const deps = makeDeps();
    const tools = applicationTools(ctx, deps);

    const created = (await tools.create_application.execute!(
      { company: "Acme", position: "Senior Engineer", status: "applied" },
      callOpts,
    )) as { status: "ok"; application: { id: string; company: string; status: string } };
    expect(created).toMatchObject({
      status: "ok",
      application: { company: "Acme", position: "Senior Engineer", status: "applied" },
    });
    const id = created.application.id;

    // A second record with a different status, to exercise the filter.
    await tools.create_application.execute!({ company: "Globex", status: "saved" }, callOpts);

    const applied = await tools.list_applications.execute!({ status: "applied" }, callOpts);
    expect(applied).toMatchObject({ status: "ok", count: 1 });

    const byCompany = await tools.list_applications.execute!({ company: "glob" }, callOpts);
    expect(byCompany).toMatchObject({ status: "ok", count: 1 });

    const updated = await tools.update_application.execute!(
      { id, status: "interviewing", interviewStages: ["phone screen", "onsite"] },
      callOpts,
    );
    expect(updated).toMatchObject({
      status: "ok",
      application: { status: "interviewing", interviewStages: ["phone screen", "onsite"] },
    });

    const fetched = await tools.get_application.execute!({ id }, callOpts);
    expect(fetched).toMatchObject({ status: "ok", application: { id, status: "interviewing" } });

    const deleted = await tools.delete_application.execute!({ id }, callOpts);
    expect(deleted).toMatchObject({ status: "ok", deleted: true });

    const gone = await tools.get_application.execute!({ id }, callOpts);
    expect(gone).toMatchObject({ status: "not_found", id });
  });

  it("update/get/delete on an unknown id return not_found", async () => {
    const tools = applicationTools(ctx, makeDeps());
    expect(await tools.get_application.execute!({ id: "nope" }, callOpts)).toMatchObject({
      status: "not_found",
    });
    expect(
      await tools.update_application.execute!({ id: "nope", notes: "x" }, callOpts),
    ).toMatchObject({ status: "not_found" });
    expect(await tools.delete_application.execute!({ id: "nope" }, callOpts)).toMatchObject({
      status: "not_found",
    });
  });

  it("scopes records per user", async () => {
    const deps = makeDeps();
    const u1 = applicationTools({ ...ctx, uid: "1" }, deps);
    const u2 = applicationTools({ ...ctx, uid: "2" }, deps);
    await u1.create_application.execute!({ company: "Acme" }, callOpts);
    const u2List = await u2.list_applications.execute!({}, callOpts);
    expect(u2List).toMatchObject({ status: "ok", count: 0 });
  });
});
