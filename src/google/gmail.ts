import { google } from "googleapis";
import type { GoogleAuthClient } from "./oauth.js";

export interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

export interface EmailContent extends EmailSummary {
  to: string;
  body: string;
}

/** Convert an ISO/`YYYY-MM-DD` date into Gmail's `YYYY/MM/DD` search format. */
export function toGmailDate(input: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.trim());
  if (!m) throw new Error(`Invalid date "${input}" (expected YYYY-MM-DD or ISO)`);
  const [, y, mo, d] = m;
  return `${y}/${mo}/${d}`;
}

export interface DateQueryParams {
  after?: string;
  before?: string;
  query?: string;
}

/** Build a Gmail search query string from a date range plus optional free-text. */
export function gmailDateQuery({ after, before, query }: DateQueryParams): string {
  const parts: string[] = [];
  if (after) parts.push(`after:${toGmailDate(after)}`);
  if (before) parts.push(`before:${toGmailDate(before)}`);
  if (query && query.trim()) parts.push(query.trim());
  return parts.join(" ");
}

function header(headers: { name?: string | null; value?: string | null }[] | undefined, name: string): string {
  const h = headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

export interface ListMessagesParams extends DateQueryParams {
  maxResults?: number;
}

/** Search messages in a date range and return lightweight summaries (metadata + snippet). */
export async function listMessages(
  client: GoogleAuthClient,
  params: ListMessagesParams,
): Promise<EmailSummary[]> {
  const gmail = google.gmail({ version: "v1", auth: client });
  const q = gmailDateQuery(params);
  const list = await gmail.users.messages.list({
    userId: "me",
    q: q || undefined,
    maxResults: params.maxResults ?? 15,
  });

  const ids = (list.data.messages ?? []).map((m) => m.id).filter((id): id is string => !!id);
  const summaries = await Promise.all(
    ids.map(async (id) => {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });
      const h = msg.data.payload?.headers ?? undefined;
      return {
        id,
        threadId: msg.data.threadId ?? "",
        from: header(h, "From"),
        subject: header(h, "Subject"),
        date: header(h, "Date"),
        snippet: msg.data.snippet ?? "",
      } satisfies EmailSummary;
    }),
  );
  return summaries;
}

/** Recursively pull the first text/plain (falling back to text/html) part of a payload. */
function extractBody(payload: unknown): string {
  const p = payload as {
    mimeType?: string;
    body?: { data?: string };
    parts?: unknown[];
  };
  if (!p) return "";
  if (p.body?.data && (p.mimeType === "text/plain" || p.mimeType === "text/html")) {
    return Buffer.from(p.body.data, "base64url").toString("utf8");
  }
  for (const part of p.parts ?? []) {
    const found = extractBody(part);
    if (found) return found;
  }
  return "";
}

/** Fetch a single message with decoded body. */
export async function getMessage(client: GoogleAuthClient, id: string): Promise<EmailContent> {
  const gmail = google.gmail({ version: "v1", auth: client });
  const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  const h = msg.data.payload?.headers ?? undefined;
  return {
    id,
    threadId: msg.data.threadId ?? "",
    from: header(h, "From"),
    to: header(h, "To"),
    subject: header(h, "Subject"),
    date: header(h, "Date"),
    snippet: msg.data.snippet ?? "",
    body: extractBody(msg.data.payload).trim(),
  };
}
