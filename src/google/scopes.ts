/**
 * Read-only access to the two surfaces the agent needs, plus `openid email` so we can read
 * the connected account's email from the id_token. `gmail.readonly` is a Google "restricted"
 * scope: fine with test users now, but requires app verification before a public production
 * launch. `openid` and `userinfo.email` are non-restricted.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;
