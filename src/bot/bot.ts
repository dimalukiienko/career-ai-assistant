import { Bot, InlineKeyboard, type Context } from "grammy";
import { env } from "../config/env.js";
import type { Deps } from "../deps.js";
import { buildStartUrl } from "../auth/state.js";
import { runAgent, summarizeSession } from "../agent/agent.js";

const WELCOME = [
  "👋 Hi! I'm your career assistant.",
  "",
  "I can read your Google Calendar and Gmail to help you stay on top of your job search — for example:",
  "• \"What's on my calendar tomorrow?\"",
  "• \"Summarize my emails from last week.\"",
  "",
  "The first time you ask, I'll send you a link to securely connect your Google account.",
  "Type /help for more, or /new to start a fresh conversation.",
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
  "/new — start a fresh conversation",
  "/summarize — condense this chat and keep going",
].join("\n");

const NO_LINK = { link_preview_options: { is_disabled: true } } as const;

/** Buttons offered when a conversation's context crosses the token threshold. */
function offerKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📝 Summarize & continue", "sess:summarize")
    .text("🆕 Start fresh", "sess:new");
}

/** Build the grammY bot wired to the shared dependencies. */
export function createBot(deps: Deps): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  // Capture / refresh the user's profile metadata on every interaction. Failures here must
  // not block the reply, so we log and continue.
  bot.use(async (ctx, next) => {
    if (ctx.from && !ctx.from.is_bot) {
      try {
        await deps.profiles.upsert({
          telegramId: String(ctx.from.id),
          username: ctx.from.username,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          languageCode: ctx.from.language_code,
        });
      } catch (err) {
        console.error("[bot] profile upsert failed:", err);
      }
    }
    await next();
  });

  bot.command("start", (ctx) => ctx.reply(WELCOME));
  bot.command("help", (ctx) => ctx.reply(HELP));

  // /new and /reset both close the active session and start fresh.
  const startFresh = async (ctx: Context) => {
    if (ctx.from) await deps.sessions.reset(String(ctx.from.id));
    await ctx.reply("🆕 Started a fresh conversation. ✨");
  };
  bot.command("new", startFresh);
  bot.command("reset", startFresh);

  bot.command("summarize", async (ctx) => {
    if (!ctx.from) return;
    const uid = String(ctx.from.id);
    const summary = await summarizeSession(deps, uid);
    await deps.sessions.rotateWithSummary(uid, summary);
    await ctx.reply("📝 Condensed our chat — I'll keep the key context. Carry on!");
  });

  bot.callbackQuery("sess:summarize", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.from) return;
    const uid = String(ctx.from.id);
    const summary = await summarizeSession(deps, uid);
    await deps.sessions.rotateWithSummary(uid, summary);
    await ctx.editMessageReplyMarkup().catch(() => {});
    await ctx.reply("📝 Condensed our chat — I'll keep the key context. Carry on!");
  });

  bot.callbackQuery("sess:new", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.from) return;
    await deps.sessions.reset(String(ctx.from.id));
    await ctx.editMessageReplyMarkup().catch(() => {});
    await ctx.reply("🆕 Started a fresh conversation. ✨");
  });

  bot.on("message:text", async (ctx) => {
    if (!ctx.from) return;
    const uid = String(ctx.from.id);

    await ctx.replyWithChatAction("typing").catch(() => {});
    try {
      const result = await runAgent(deps, {
        uid,
        oauthUrl: buildStartUrl(uid),
        text: ctx.message.text,
      });
      await ctx.reply(result.text, NO_LINK);
      await applyThresholdPolicy(deps, ctx, uid, result.prevTokens, result.tokens);
    } catch (err) {
      console.error(`[bot] agent run failed for ${uid}:`, err);
      await ctx.reply("Something went wrong while processing that. Please try again in a moment.");
    }
  });

  bot.catch((err) => console.error("[bot] unhandled error:", err.error));

  return bot;
}

/**
 * After a turn, nudge or rotate based on context size: at `2n` auto-summarize (cost guard);
 * on the turn that first crosses `n`, offer the summarize/new choice.
 */
async function applyThresholdPolicy(
  deps: Deps,
  ctx: Context,
  uid: string,
  prevTokens: number,
  tokens: number,
): Promise<void> {
  const limit = env.SESSION_TOKEN_LIMIT;

  if (tokens >= 2 * limit) {
    const summary = await summarizeSession(deps, uid);
    await deps.sessions.rotateWithSummary(uid, summary);
    await ctx.reply("📝 This chat got long, so I condensed it to keep things fast — the key context is preserved.");
    return;
  }

  if (prevTokens < limit && tokens >= limit) {
    await ctx.reply("This chat is getting long. Want me to condense it or start fresh?", {
      reply_markup: offerKeyboard(),
    });
  }
}
