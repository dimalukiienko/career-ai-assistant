import { generateText, stepCountIs, type ModelMessage } from "ai";
import { env } from "../config/env.js";
import type { Deps } from "../deps.js";
import { getModel } from "./model.js";
import { buildTools } from "./tools/index.js";

function systemPrompt(summary?: string | null): string {
  const now = new Date();
  const lines = [
    "You are a helpful career assistant inside a Telegram chat.",
    "You can read the user's Google Calendar and Gmail through tools.",
    `The current UTC date and time is ${now.toISOString()}.`,
    "Resolve relative dates like 'today', 'tomorrow', or 'last week' into absolute dates before calling tools; assume UTC unless the user gives a timezone.",
    "If a tool returns status 'needs_auth', share its authUrl with the user as a clickable link, briefly explain it connects their Google account, and then stop.",
    "Keep replies concise and friendly for a chat interface. Summarize calendar events and emails rather than dumping raw fields.",
  ];
  if (summary) {
    lines.push(
      `Summary of the earlier conversation (continue from this context):\n${summary}`,
    );
  }
  return lines.join("\n");
}

export interface RunAgentArgs {
  uid: string;
  oauthUrl: string;
  text: string;
}

export interface RunAgentResult {
  text: string;
  /** Context token count recorded on the previous turn (0 for a fresh session). */
  prevTokens: number;
  /** Context token count of this turn — used to drive the summarize/new offer. */
  tokens: number;
}

/** Run one turn of the agent for a user message and return the assistant's reply + token usage. */
export async function runAgent(deps: Deps, { uid, oauthUrl, text }: RunAgentArgs): Promise<RunAgentResult> {
  const { messages, summary, tokenCount: prevTokens } = await deps.sessions.getActive(uid);
  const userMessage: ModelMessage = { role: "user", content: text };

  const result = await generateText({
    model: getModel(),
    system: systemPrompt(summary),
    messages: [...messages, userMessage],
    tools: buildTools({ uid, oauthUrl }, deps),
    stopWhen: stepCountIs(env.AGENT_MAX_STEPS),
  });

  // inputTokens ≈ the context size sent this turn — the right proxy for "how big the
  // conversation has grown". Fall back through totalTokens and the prior count.
  const tokens = result.usage.inputTokens ?? result.usage.totalTokens ?? prevTokens;

  await deps.sessions.append(uid, [userMessage, ...(result.response.messages as ModelMessage[])], tokens);

  return {
    text: result.text.trim() || "Sorry, I couldn't produce a response. Please try again.",
    prevTokens,
    tokens,
  };
}

/**
 * Condense the active session into a brief the assistant can continue from. Returns the
 * existing carried summary unchanged when the session has no messages yet.
 */
export async function summarizeSession(deps: Deps, uid: string): Promise<string> {
  const { messages, summary } = await deps.sessions.getActive(uid);
  if (!messages.length) return summary ?? "";

  const system = [
    "Condense the conversation into a brief the assistant can continue from later.",
    "Capture: the user's goals, key facts learned (e.g. from their calendar/email), decisions made, and open threads.",
    "Write at most 200 words. No preamble, no markdown headers.",
    summary ? `Earlier context to fold in:\n${summary}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await generateText({
    model: getModel(),
    system,
    messages: [...messages, { role: "user", content: "Summarize our conversation so far as instructed." }],
  });

  const condensed = result.text.trim();
  if (!condensed) return summary ?? "";
  return condensed;
}
