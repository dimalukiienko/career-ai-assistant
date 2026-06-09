import type { ModelMessage } from "ai";

/**
 * Per-user conversation state. A user has at most one *active* session; when its context
 * grows past a token threshold the bot offers to summarize & continue or start fresh.
 * `rotateWithSummary` closes the active session and opens a new one carrying a summary so
 * continuity survives the reset.
 *
 * Storage seam: InMemorySessionStore is the test impl; SupabaseSessionStore is used in prod
 * (wired in src/deps.ts).
 */
export interface ActiveSession {
  id: string;
  messages: ModelMessage[];
  /** Carried-over brief from the previous (rotated) session, or null. */
  summary: string | null;
  /** Context tokens recorded on the last turn. */
  tokenCount: number;
}

export interface SessionStore {
  /** The user's active session, lazily created empty if none exists. */
  getActive(uid: string): Promise<ActiveSession>;
  /** Append messages to the active session and record the latest context token count. */
  append(uid: string, messages: ModelMessage[], tokenCount: number): Promise<void>;
  /** Close the active session; the next getActive starts a fresh empty one. */
  reset(uid: string): Promise<void>;
  /** Close the active session and open a fresh one seeded with `summary`. */
  rotateWithSummary(uid: string, summary: string): Promise<void>;
}

interface MemSession {
  id: string;
  messages: ModelMessage[];
  summary: string | null;
  tokenCount: number;
}

export class InMemorySessionStore implements SessionStore {
  private readonly map = new Map<string, MemSession>();
  private seq = 0;

  /** @param maxMessages hard safety cap on retained messages (token rotation is the main bound). */
  constructor(private readonly maxMessages = 200) {}

  private ensure(uid: string, summary: string | null = null): MemSession {
    let s = this.map.get(uid);
    if (!s) {
      s = { id: `mem-${++this.seq}`, messages: [], summary, tokenCount: 0 };
      this.map.set(uid, s);
    }
    return s;
  }

  async getActive(uid: string): Promise<ActiveSession> {
    const s = this.ensure(uid);
    return { id: s.id, messages: [...s.messages], summary: s.summary, tokenCount: s.tokenCount };
  }

  async append(uid: string, messages: ModelMessage[], tokenCount: number): Promise<void> {
    const s = this.ensure(uid);
    s.messages = [...s.messages, ...messages].slice(-this.maxMessages);
    s.tokenCount = tokenCount;
  }

  async reset(uid: string): Promise<void> {
    this.map.delete(uid);
  }

  async rotateWithSummary(uid: string, summary: string): Promise<void> {
    this.map.delete(uid);
    this.ensure(uid, summary);
  }
}
