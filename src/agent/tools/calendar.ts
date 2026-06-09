import { tool } from "ai";
import { z } from "zod";
import type { Deps } from "../../deps.js";
import { getAuthedClient } from "../../google/client.js";
import { listEvents } from "../../google/calendar.js";
import { needsAuth, type UserContext } from "./shared.js";

export function calendarTools(ctx: UserContext, deps: Deps) {
  return {
    list_calendar_events: tool({
      description:
        "List the user's Google Calendar events within an explicit time range. " +
        "Resolve relative phrases (today, tomorrow, next week) to absolute RFC3339 timestamps first.",
      inputSchema: z.object({
        timeMin: z.string().describe("Range start, RFC3339/ISO 8601, e.g. 2026-06-09T00:00:00Z"),
        timeMax: z.string().describe("Range end, RFC3339/ISO 8601"),
        maxResults: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ timeMin, timeMax, maxResults }) => {
        const client = await getAuthedClient(ctx.uid, deps);
        if (!client) return needsAuth(ctx);
        const events = await listEvents(client, { timeMin, timeMax, maxResults });
        return { status: "ok" as const, count: events.length, events };
      },
    }),
  };
}
