import { describe, it, expect } from "vitest";
import type { ModelMessage } from "ai";
import { pendingReplay } from "../src/bot/post-auth.js";

const userMsg = (text: string): ModelMessage => ({ role: "user", content: text });

// Assistant + tool messages of a turn where a tool returned needs_auth and the model relayed
// the link, mirroring what runAgent appends from result.response.messages.
const needsAuthTail = (): ModelMessage[] => [
  {
    role: "assistant",
    content: [{ type: "tool-call", toolCallId: "c1", toolName: "listEvents", input: {} }],
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "c1",
        toolName: "listEvents",
        output: { type: "json", value: { status: "needs_auth", authUrl: "https://x", message: "connect" } },
      },
    ],
  },
  { role: "assistant", content: "Connect your Google account: https://x" },
];

const answeredTail = (): ModelMessage[] => [
  {
    role: "assistant",
    content: [{ type: "tool-call", toolCallId: "c1", toolName: "listEvents", input: {} }],
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "c1",
        toolName: "listEvents",
        output: { type: "json", value: { status: "ok", count: 0, events: [] } },
      },
    ],
  },
  { role: "assistant", content: "You have nothing scheduled tomorrow." },
];

describe("pendingReplay", () => {
  it("returns the triggering user text when the last turn needed auth", () => {
    const history = [userMsg("check my email"), ...needsAuthTail()];
    expect(pendingReplay(history)?.text).toBe("check my email");
  });

  it("strips the failed needs_auth turn from priorHistory", () => {
    const history = [
      userMsg("hello"),
      { role: "assistant", content: "hi!" } as ModelMessage,
      userMsg("check my email"),
      ...needsAuthTail(),
    ];
    const plan = pendingReplay(history);
    // Everything from the triggering user message onward is dropped; earlier turns remain.
    expect(plan?.priorHistory).toEqual([history[0], history[1]]);
    expect(JSON.stringify(plan?.priorHistory)).not.toContain("needs_auth");
  });

  it("picks the most recent user message when several turns exist", () => {
    const history = [
      userMsg("hello"),
      { role: "assistant", content: "hi!" } as ModelMessage,
      userMsg("what's on my calendar tomorrow?"),
      ...needsAuthTail(),
    ];
    expect(pendingReplay(history)?.text).toBe("what's on my calendar tomorrow?");
  });

  it("returns null when the last turn was answered normally", () => {
    const history = [userMsg("what's on my calendar tomorrow?"), ...answeredTail()];
    expect(pendingReplay(history)).toBeNull();
  });

  it("returns null for empty history", () => {
    expect(pendingReplay([])).toBeNull();
  });

  it("returns null when the last user message has no following turn", () => {
    expect(pendingReplay([userMsg("check my email")])).toBeNull();
  });
});
