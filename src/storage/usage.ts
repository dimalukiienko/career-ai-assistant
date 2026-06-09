/**
 * Cumulative model-token spend per user, summed across every model call we make on their
 * behalf — agent turns *and* summarization. Distinct from a session's `token_count` (which is
 * the current context size, used to drive rotation); this is lifetime spend.
 *
 * Storage seam: InMemoryUsageStore is the test impl; SupabaseUsageStore is used in prod.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface UsageStore {
  /** Add one model call's usage to the user's running total. */
  record(uid: string, usage: TokenUsage): Promise<void>;
  /** The user's lifetime token usage (zeros if they've never spent any). */
  total(uid: string): Promise<TokenUsage>;
}

const zero = (): TokenUsage => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });

export class InMemoryUsageStore implements UsageStore {
  private readonly map = new Map<string, TokenUsage>();

  async record(uid: string, usage: TokenUsage): Promise<void> {
    const prev = this.map.get(uid) ?? zero();
    this.map.set(uid, {
      inputTokens: prev.inputTokens + usage.inputTokens,
      outputTokens: prev.outputTokens + usage.outputTokens,
      totalTokens: prev.totalTokens + usage.totalTokens,
    });
  }

  async total(uid: string): Promise<TokenUsage> {
    return { ...(this.map.get(uid) ?? zero()) };
  }
}
