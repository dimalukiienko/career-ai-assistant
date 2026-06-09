import type { Hono } from "hono";
import { webhookCallback } from "grammy";
import type { Bot } from "grammy";
import { env } from "../../config/env.js";

/**
 * Mount the Telegram webhook. grammY verifies the X-Telegram-Bot-Api-Secret-Token header
 * against TELEGRAM_WEBHOOK_SECRET, so unsigned requests are rejected before reaching the bot.
 */
export function registerTelegram(app: Hono, bot: Bot): void {
  app.post(
    "/telegram/webhook",
    webhookCallback(bot, "hono", { secretToken: env.TELEGRAM_WEBHOOK_SECRET }),
  );
}
