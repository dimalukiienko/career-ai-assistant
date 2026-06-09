/**
 * Read-only access to the two surfaces the agent needs. `gmail.readonly` is a Google
 * "restricted" scope: fine with test users now, but requires app verification before a
 * public production launch.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
] as const;
