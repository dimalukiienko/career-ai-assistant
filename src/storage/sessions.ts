import type { ModelMessage } from "ai";

/**
 * Per-user conversation history. Trimmed to a bounded window so in-memory growth (and,
 * later, token cost) stays in check.
 *
 * Storage seam: swap InMemorySessionStore for a Supabase-backed impl later without
 * touching callers.
 */
export interface SessionStore {
  getHistory(uid: string): Promise<ModelMessage[]>;
  append(uid: string, messages: ModelMessage[]): Promise<void>;
  reset(uid: string): Promise<void>;
}

export class InMemorySessionStore implements SessionStore {
  private readonly map = new Map<string, ModelMessage[]>();

  /** @param maxMessages most recent messages retained per user. */
  constructor(private readonly maxMessages = 20) {}

  async getHistory(uid: string): Promise<ModelMessage[]> {
    return [...(this.map.get(uid) ?? [])];
  }

  async append(uid: string, messages: ModelMessage[]): Promise<void> {
    const next = [...(this.map.get(uid) ?? []), ...messages];
    this.map.set(uid, next.slice(-this.maxMessages));
  }

  async reset(uid: string): Promise<void> {
    this.map.delete(uid);
  }
}
