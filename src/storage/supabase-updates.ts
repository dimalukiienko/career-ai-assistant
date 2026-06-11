import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types.js";
import type { UpdateDedupStore } from "./updates.js";

/**
 * Supabase-backed UpdateDedupStore. The `processed_updates` primary key makes the claim atomic:
 * the first delivery of an `update_id` inserts the row and proceeds; any concurrent or later
 * redelivery hits the unique-violation (Postgres error 23505) and is skipped. Shared across
 * instances, so it holds even when Cloud Run scales out.
 */
export class SupabaseUpdateDedupStore implements UpdateDedupStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async claim(updateId: number): Promise<boolean> {
    const { error } = await this.db.from("processed_updates").insert({ update_id: updateId });
    if (!error) return true;
    if (error.code === "23505") return false; // unique violation = already processed
    throw new Error(`processed_updates.claim failed: ${error.message}`);
  }
}
