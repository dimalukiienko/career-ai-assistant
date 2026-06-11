import { describe, it, expect, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { applicationTools } from "../src/agent/tools/applications.js";
import { calendarTools } from "../src/agent/tools/calendar.js";
import { gmailTools } from "../src/agent/tools/gmail.js";
import { jobPostingTools } from "../src/agent/tools/job-posting.js";
import { LocalEncryptor } from "../src/crypto/local.js";
import { InMemoryTokenStore } from "../src/storage/tokens.js";
import { InMemorySessionStore } from "../src/storage/sessions.js";
import { InMemoryProfileStore } from "../src/storage/profiles.js";
import { InMemoryUsageStore } from "../src/storage/usage.js";
import { InMemoryApplicationStore } from "../src/storage/applications.js";
import { InMemoryUpdateDedupStore } from "../src/storage/updates.js";
import type { Deps } from "../src/deps.js";

function makeDeps(): Deps {
  return {
    encryptor: new LocalEncryptor(randomBytes(32).toString("base64")),
    profiles: new InMemoryProfileStore(),
    tokens: new InMemoryTokenStore(),
    sessions: new InMemorySessionStore(),
    usage: new InMemoryUsageStore(),
    applications: new InMemoryApplicationStore(),
    updates: new InMemoryUpdateDedupStore(),
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

describe("fetch_job_posting", () => {
  const ctx = { uid: "1", oauthUrl: "https://example.com/oauth/google/start?u=1&sig=abc" };

  function htmlResponse(html: string) {
    return { ok: true, status: 200, text: async () => html } as Response;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns extracted main text and strips scripts", async () => {
    const html = `
      <html><head><title>Senior Engineer — Acme</title></head>
        <body>
          <nav>home about</nav>
          <script>console.log("tracking")</script>
          <main>
            <h1>Senior Engineer</h1>
            <p>${"We are hiring a senior engineer to build great things. ".repeat(10)}</p>
          </main>
          <footer>copyright</footer>
        </body></html>`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(htmlResponse(html));

    const { fetch_job_posting } = jobPostingTools(ctx, makeDeps());
    const res = (await fetch_job_posting.execute!(
      { url: "https://jobs.example.com/senior-engineer" },
      callOpts,
    )) as { status: string; title: string; text: string };

    expect(res.status).toBe("ok");
    expect(res.title).toBe("Senior Engineer — Acme");
    expect(res.text).toContain("senior engineer");
    expect(res.text).not.toContain("tracking");
    expect(res.text).not.toContain("copyright");
  });

  it("returns blocked when the page has little text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      htmlResponse("<html><body><p>Please log in</p></body></html>"),
    );

    const { fetch_job_posting } = jobPostingTools(ctx, makeDeps());
    const res = await fetch_job_posting.execute!({ url: "https://jobs.example.com/x" }, callOpts);
    expect(res).toMatchObject({ status: "blocked" });
  });

  it("returns error on a non-ok HTTP response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 403 } as Response);

    const { fetch_job_posting } = jobPostingTools(ctx, makeDeps());
    const res = await fetch_job_posting.execute!({ url: "https://jobs.example.com/x" }, callOpts);
    expect(res).toMatchObject({ status: "error" });
  });

  it("returns error when the fetch throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const { fetch_job_posting } = jobPostingTools(ctx, makeDeps());
    const res = (await fetch_job_posting.execute!(
      { url: "https://jobs.example.com/x" },
      callOpts,
    )) as { status: string; message: string };
    expect(res.status).toBe("error");
    expect(res.message).toContain("network down");
  });
});
