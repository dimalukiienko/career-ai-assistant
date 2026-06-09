import type { Deps } from "../../deps.js";
import { calendarTools } from "./calendar.js";
import { gmailTools } from "./gmail.js";
import type { UserContext } from "./shared.js";

export type { UserContext } from "./shared.js";

/** All tools, bound to one user's context + the shared dependencies. */
export function buildTools(ctx: UserContext, deps: Deps) {
  return {
    ...calendarTools(ctx, deps),
    ...gmailTools(ctx, deps),
  };
}
