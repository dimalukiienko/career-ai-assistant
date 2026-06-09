import { generateText, stepCountIs, type ModelMessage } from "ai";
import { env } from "../config/env.js";
import type { Deps } from "../deps.js";
import { getModel } from "./model.js";
import { buildTools } from "./tools/index.js";

function systemPrompt(): string {
  const now = new Date();
  return [
    "You are a helpful career assistant inside a Telegram chat.",
    "You can read the user's Google Calendar and Gmail through tools.",
    `The current UTC date and time is ${now.toISOString()}.`,
    "Resolve relative dates like 'today', 'tomorrow', or 'last week' into absolute dates before calling tools; assume UTC unless the user gives a timezone.",
    "If a tool returns status 'needs_auth', share its authUrl with the user as a clickable link, briefly explain it connects their Google account, and then stop.",
    "Keep replies concise and friendly for a chat interface. Summarize calendar events and emails rather than dumping raw fields.",
  ].join("\n");
}

export interface RunAgentArgs {
  uid: string;
  oauthUrl: string;
  text: string;
}

/** Run one turn of the agent for a user message and return the assistant's reply text. */
export async function runAgent(deps: Deps, { uid, oauthUrl, text }: RunAgentArgs): Promise<string> {
  const history = await deps.sessions.getHistory(uid);
  const userMessage: ModelMessage = { role: "user", content: text };

  const result = await generateText({
    model: getModel(),
    system: systemPrompt(),
    messages: [...history, userMessage],
    tools: buildTools({ uid, oauthUrl }, deps),
    stopWhen: stepCountIs(env.AGENT_MAX_STEPS),
  });

  await deps.sessions.append(uid, [userMessage, ...(result.response.messages as ModelMessage[])]);

  return result.text.trim() || "Sorry, I couldn't produce a response. Please try again.";
}
