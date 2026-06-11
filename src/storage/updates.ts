/**
 * Idempotency guard for Telegram webhook deliveries. The agent runs inline in the webhook
 * handler, so a slow turn can blow past grammY's timeout and make Telegram redeliver the same
 * update. We claim each `update_id` before doing any work; a redelivery fails the claim and is
 * skipped, so one message is only ever processed once.
 */
export interface UpdateDedupStore {
  /**
   * Atomically record a Telegram `update_id`. Returns `true` if it was newly claimed (this
   * delivery should be processed) or `false` if it was already seen (a redelivery — skip).
   */
  claim(updateId: number): Promise<boolean>;
}

/** In-memory dedup store — the test seam. Not safe across instances (use Supabase in prod). */
export class InMemoryUpdateDedupStore implements UpdateDedupStore {
  private readonly seen = new Set<number>();

  async claim(updateId: number): Promise<boolean> {
    if (this.seen.has(updateId)) return false;
    this.seen.add(updateId);
    return true;
  }
}
