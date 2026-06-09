import { google } from "googleapis";
import type { GoogleAuthClient } from "./oauth.js";

export interface CalendarEvent {
  id: string;
  summary: string;
  start?: string;
  end?: string;
  location?: string;
  attendees?: string[];
  htmlLink?: string;
}

export interface ListEventsParams {
  timeMin: string; // RFC3339 / ISO
  timeMax: string;
  maxResults?: number;
}

/** List the user's primary-calendar events in [timeMin, timeMax], expanding recurrences. */
export async function listEvents(
  client: GoogleAuthClient,
  { timeMin, timeMax, maxResults = 25 }: ListEventsParams,
): Promise<CalendarEvent[]> {
  const calendar = google.calendar({ version: "v3", auth: client });
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults,
  });

  return (res.data.items ?? []).map((e) => ({
    id: e.id ?? "",
    summary: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? undefined,
    end: e.end?.dateTime ?? e.end?.date ?? undefined,
    location: e.location ?? undefined,
    attendees: e.attendees?.map((a) => a.email ?? "").filter(Boolean),
    htmlLink: e.htmlLink ?? undefined,
  }));
}
