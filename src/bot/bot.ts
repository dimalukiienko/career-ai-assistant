import { Bot } from "grammy";
import { env } from "../config/env.js";
import type { Deps } from "../deps.js";
import { buildStartUrl } from "../auth/state.js";
import { runAgent } from "../agent/agent.js";

const WELCOME = [
  "👋 Hi! I'm your career assistant.",
  "",
  "I can read your Google Calendar and Gmail to help you stay on top of your job search — for example:",
  "• \"What's on my calendar tomorrow?\"",
  "• \"Summarize my emails from last week.\"",
  "",
  "The first time you ask, I'll send you a link to securely connect your Google account.",
  "Type /help for more, or /reset to clear our conversation.",
].join("\n");

const HELP = [
  "I read your Google Calendar and Gmail (read-only) to answer questions.",
  "",
  "Try:",
  "• \"Do I have any interviews this week?\"",
  "• \"Show recruiter emails from the last 7 days.\"",
  "",
  "Commands:",
  "/start — intro",
  "/help — this message",
  "/reset — clear our conversation history",
].join("\n");

/** Build the grammY bot wired to the shared dependencies. */
export function createBot(deps: Deps): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.command("start", (ctx) => ctx.reply(WELCOME));
  bot.command("help", (ctx) => ctx.reply(HELP));

  bot.command("reset", async (ctx) => {
    if (ctx.from) await deps.sessions.reset(String(ctx.from.id));
    await ctx.reply("Cleared. We're starting fresh. ✨");
  });

  bot.on("message:text", async (ctx) => {
    if (!ctx.from) return;
    const uid = String(ctx.from.id);

    await ctx.replyWithChatAction("typing").catch(() => {});
    try {
      const reply = await runAgent(deps, {
        uid,
        oauthUrl: buildStartUrl(uid),
        text: ctx.message.text,
      });
      await ctx.reply(reply, { link_preview_options: { is_disabled: true } });
    } catch (err) {
      console.error(`[bot] agent run failed for ${uid}:`, err);
      await ctx.reply("Something went wrong while processing that. Please try again in a moment.");
    }
  });

  bot.catch((err) => console.error("[bot] unhandled error:", err.error));

  return bot;
}
