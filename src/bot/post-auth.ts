import type { ModelMessage } from "ai";
import type { Bot } from "grammy";
import type { Deps } from "../deps.js";
import { buildStartUrl } from "../auth/state.js";
import { runAgent } from "../agent/agent.js";

const MOCK_SUCCESS =
  "✅ Your Google account is connected! Ask me anything about your calendar or emails.";

export interface ReplayPlan {
  /** The user message to re-run now that the account is connected. */
  text: string;
  /**
   * History with the failed `needs_auth` turn removed. Replaying against the original history
   * would let the model see its own "user hasn't connected, here's the link" reply and just
   * repeat it instead of calling the tool — so we strip that turn first.
   */
  priorHistory: ModelMessage[];
}

/**
 * If the most recent turn ended in a `needs_auth` request, return a plan to replay the user
 * message that triggered it; otherwise `null`.
 *
 * The tail (messages after the last user message) is exactly that turn's assistant + tool
 * messages. We detect the OAuth prompt by looking for the `needs_auth` marker in the
 * serialized tail — resilient to AI-SDK tool-result shape changes, and `needs_auth` only
 * originates from our own `needsAuth()` helper.
 */
export function pendingReplay(history: ModelMessage[]): ReplayPlan | null {
  const lastUserIdx = history.findLastIndex(
    (m) => m.role === "user" && typeof m.content === "string",
  );
  const lastUser = history[lastUserIdx];
  if (!lastUser) return null;

  const tail = history.slice(lastUserIdx + 1);
  if (!JSON.stringify(tail).includes("needs_auth")) return null;

  return { text: lastUser.content as string, priorHistory: history.slice(0, lastUserIdx) };
}

/**
 * Called (detached) after a successful OAuth callback. If a question was pending behind the
 * connect prompt, re-run the agent on it and post the answer to the chat; otherwise post a
 * simple success message. Never throws — it runs outside the HTTP response lifecycle.
 */
export async function replayAfterAuth(deps: Deps, bot: Bot, uid: string): Promise<void> {
  try {
    const { messages } = await deps.sessions.getActive(uid);
    const plan = pendingReplay(messages);

    let message = MOCK_SUCCESS;
    if (plan) {
      // Rewrite the session without the failed needs_auth turn, then let runAgent re-run the
      // question against clean history (tokens now exist, so the tool call succeeds). The 0
      // token count is a placeholder — runAgent immediately re-records the real count.
      await deps.sessions.reset(uid);
      if (plan.priorHistory.length) await deps.sessions.append(uid, plan.priorHistory, 0);
      message = (await runAgent(deps, { uid, oauthUrl: buildStartUrl(uid), text: plan.text })).text;
    }

    await bot.api.sendMessage(Number(uid), message, {
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    console.error("[post-auth] replay failed for", uid, err);
  }
}
