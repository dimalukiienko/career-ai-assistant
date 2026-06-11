import { tool } from "ai";
import { z } from "zod";
import type { Deps } from "../../deps.js";
import { getAuthedClient } from "../../google/client.js";
import { listMessages, getMessage } from "../../google/gmail.js";
import { needsAuth, type UserContext } from "./shared.js";

export function gmailTools(ctx: UserContext, deps: Deps) {
  return {
    list_emails: tool({
      description:
        "Search the user's Gmail within a date range and return message summaries " +
        "(from, subject, date, snippet, id). Use get_email with an id to read full content.",
      inputSchema: z.object({
        after: z.string().optional().describe("Only mail on/after this date, YYYY-MM-DD"),
        before: z.string().optional().describe("Only mail before this date, YYYY-MM-DD"),
        query: z
          .string()
          .optional()
          .describe(
            'Extra Gmail search terms. Supports any Gmail operator or plain keywords, ' +
              'e.g. "from:recruiter is:unread", "subject:interview", or just "Acme". ' +
              "If a from: search finds nothing, retry with subject: or a bare keyword.",
          ),
        maxResults: z.number().int().min(1).max(30).optional(),
      }),
      execute: async (params) => {
        const client = await getAuthedClient(ctx.uid, deps);
        if (!client) return needsAuth(ctx);
        const emails = await listMessages(client, params);
        return { status: "ok" as const, count: emails.length, emails };
      },
    }),

    get_email: tool({
      description: "Fetch one Gmail message by id, including the decoded body.",
      inputSchema: z.object({
        id: z.string().describe("Message id from list_emails"),
      }),
      execute: async ({ id }) => {
        const client = await getAuthedClient(ctx.uid, deps);
        if (!client) return needsAuth(ctx);
        const email = await getMessage(client, id);
        return { status: "ok" as const, email };
      },
    }),
  };
}
