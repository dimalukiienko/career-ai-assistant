import { generateText, stepCountIs, type LanguageModelUsage, type ModelMessage } from "ai";
import { env } from "../config/env.js";
import type { Deps } from "../deps.js";
import type { TokenUsage } from "../storage/usage.js";
import { getModel } from "./model.js";
import { buildTools } from "./tools/index.js";

/** Normalize an AI SDK usage object (fields are optional) into a concrete TokenUsage. */
function usageFrom(u: LanguageModelUsage): TokenUsage {
  const inputTokens = u.inputTokens ?? 0;
  const outputTokens = u.outputTokens ?? 0;
  return { inputTokens, outputTokens, totalTokens: u.totalTokens ?? inputTokens + outputTokens };
}

const URL_RE = /https?:\/\/\S+/i;

/** True when the text contains an http(s) URL (not just the bare word "http"). */
export function containsUrl(text: string): boolean {
  return URL_RE.test(text);
}

/**
 * Extra system-prompt lines injected only when the turn's content warrants them. Keeps
 * conditional hints in one place so new rules are easy to add.
 */
export function contextualInstructions(turnText: string): string[] {
  const lines: string[] = [];
  if (containsUrl(turnText)) {
    lines.push(
      "The user's latest message contains a link. If their request involves a job " +
        "or application (e.g. saving/tracking a role, scheduling around an interview) " +
        "but they did not explicitly ask you to read the link, offer to fetch the " +
        "posting with fetch_job_posting first to fill in the title, company, and " +
        "requirements — then proceed once they confirm. If they did ask you to read " +
        "it, just fetch it.",
    );
  }
  return lines;
}

function systemPrompt(summary: string | null | undefined, turnText: string): string {
  const now = new Date();
  const lines = [
    "You are a helpful career assistant inside a Telegram chat.",
    "You can read the user's Google Calendar and Gmail through tools.",
    "You can also track the user's job applications: create, list, get, update, and delete records. " +
      "Valid statuses are saved, applied, screening, interviewing, offer, accepted, rejected, withdrawn; " +
      "work modes are onsite, remote, hybrid. When updating or deleting, identify the record by the id " +
      "from a prior list/get. Confirm with the user before deleting a record.",
    "When the user shares a link to a job posting, use fetch_job_posting to read it. " +
      "If it returns status 'blocked' or 'error', ask the user to paste the job description text instead.",
    `The current UTC date and time is ${now.toISOString()}.`,
    "Resolve relative dates like 'today', 'tomorrow', or 'last week' into absolute dates before calling tools; assume UTC unless the user gives a timezone.",
    "If a tool returns status 'needs_auth', share its authUrl with the user as a clickable link, briefly explain it connects their Google account, and then stop.",
    "When searching Gmail, if a list_emails search returns no results (count 0), don't give up immediately: try again with a broader query — search by subject: or a plain keyword instead of from:, drop or widen the date range, or use the sender's company/name as a keyword. Only tell the user nothing was found after a reasonable broader attempt.",
    "Keep replies concise and friendly for a chat interface. Summarize calendar events and emails rather than dumping raw fields.",
  ];
  lines.push(...contextualInstructions(turnText));
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
  /** Dev-only hook: fired before each tool's execute, with the tool name + validated input. */
  onToolCall?: (toolName: string, input: unknown) => void | Promise<void>;
}

/**
 * Wrap each tool's `execute` so `onToolCall` fires (with the tool name + input) right before
 * the real execution. Generic over the tools record so the AI SDK typing is preserved.
 */
function withToolNotifications<T extends Record<string, any>>(
  tools: T,
  onToolCall: (toolName: string, input: unknown) => void | Promise<void>,
): T {
  return Object.fromEntries(
    Object.entries(tools).map(([name, t]) => [
      name,
      {
        ...t,
        execute: async (input: unknown, opts: any) => {
          await onToolCall(name, input);
          return t.execute(input, opts);
        },
      },
    ]),
  ) as T;
}

export interface RunAgentResult {
  text: string;
  /** Context token count recorded on the previous turn (0 for a fresh session). */
  prevTokens: number;
  /** Context token count of this turn — used to drive the summarize/new offer. */
  tokens: number;
}

/** Run one turn of the agent for a user message and return the assistant's reply + token usage. */
export async function runAgent(deps: Deps, { uid, oauthUrl, text, onToolCall }: RunAgentArgs): Promise<RunAgentResult> {
  const { messages, summary, tokenCount: prevTokens } = await deps.sessions.getActive(uid);
  const userMessage: ModelMessage = { role: "user", content: text };

  const tools = buildTools({ uid, oauthUrl }, deps);
  const result = await generateText({
    model: getModel(),
    system: systemPrompt(summary, text),
    messages: [...messages, userMessage],
    tools: onToolCall ? withToolNotifications(tools, onToolCall) : tools,
    stopWhen: stepCountIs(env.AGENT_MAX_STEPS),
  });

  const usage = usageFrom(result.usage);
  await deps.usage.record(uid, usage);

  // inputTokens ≈ the context size sent this turn — the right proxy for "how big the
  // conversation has grown". Fall back to the prior count if the provider omitted it.
  const tokens = result.usage.inputTokens ?? (usage.totalTokens || prevTokens);

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

  // The summarization call costs tokens too — count it toward the user's total.
  await deps.usage.record(uid, usageFrom(result.usage));

  const condensed = result.text.trim();
  if (!condensed) return summary ?? "";
  return condensed;
}
