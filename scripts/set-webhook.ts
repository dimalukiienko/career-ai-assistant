import "../src/config/bootstrap-env.js";
import { Bot } from "grammy";
import { env } from "../src/config/env.js";

/**
 * Register (or clear) the Telegram webhook for this bot.
 *   pnpm set-webhook         -> points Telegram at ${PUBLIC_URL}/telegram/webhook
 *   pnpm set-webhook --clear -> deletes the webhook (e.g. to switch back to long polling)
 */
async function main() {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  await bot.init();

  if (process.argv.includes("--clear")) {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    console.log("Webhook cleared.");
    return;
  }

  const url = `${env.PUBLIC_URL}/telegram/webhook`;
  await bot.api.setWebhook(url, {
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  console.log(`Webhook set to ${url}`);
}

main().catch((err) => {
  console.error("Failed to set webhook:", err);
  process.exit(1);
});
