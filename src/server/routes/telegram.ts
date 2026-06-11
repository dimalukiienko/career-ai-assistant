import type { Hono } from "hono";
import { webhookCallback } from "grammy";
import type { Bot } from "grammy";
import { env } from "../../config/env.js";

/**
 * Mount the Telegram webhook. grammY verifies the X-Telegram-Bot-Api-Secret-Token header
 * against TELEGRAM_WEBHOOK_SECRET, so unsigned requests are rejected before reaching the bot.
 *
 * The agent runs inline, so a turn can take a while. grammY's defaults (`onTimeout: "throw"`,
 * 10s) would return a 500 on any slower turn — which makes Telegram redeliver the same update
 * and the agent re-run it (duplicate replies/records). Instead we await the turn up to 55s
 * (under Telegram's ~60s wait and Cloud Run's request timeout) and return 200 if it overruns,
 * so Telegram won't retry. The `update_id` dedup middleware (src/bot/bot.ts) is the safety net
 * for the rare turn that still exceeds this.
 */
export function registerTelegram(app: Hono, bot: Bot): void {
  app.post(
    "/telegram/webhook",
    webhookCallback(bot, "hono", {
      onTimeout: "return",
      timeoutMilliseconds: 55_000,
      secretToken: env.TELEGRAM_WEBHOOK_SECRET,
    }),
  );
}
