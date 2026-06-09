import { Hono } from "hono";
import type { Bot } from "grammy";
import type { Deps } from "../deps.js";
import { registerHealth } from "./routes/health.js";
import { registerTelegram } from "./routes/telegram.js";
import { registerOAuth } from "./routes/oauth.js";

/** Assemble the Hono app: health probe, Telegram webhook, and Google OAuth routes. */
export function createApp(deps: Deps, bot: Bot): Hono {
  const app = new Hono();
  registerHealth(app);
  registerTelegram(app, bot);
  registerOAuth(app, deps);
  return app;
}
