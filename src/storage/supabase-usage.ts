import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types.js";
import type { ProfileStore } from "./profiles.js";
import type { TokenUsage, UsageStore } from "./usage.js";

/**
 * Supabase-backed UsageStore. Increments go through the `add_token_usage` RPC so they are
 * atomic; reads pull the running-total `token_usage` row (zeros when none exists yet).
 */
export class SupabaseUsageStore implements UsageStore {
  constructor(
    private readonly db: SupabaseClient<Database>,
    private readonly profiles: ProfileStore,
  ) {}

  async record(uid: string, usage: TokenUsage): Promise<void> {
    const profileId = await this.profiles.upsert({ telegramId: uid });

    const { error } = await this.db.rpc("add_token_usage", {
      p_profile_id: profileId,
      p_input: usage.inputTokens,
      p_output: usage.outputTokens,
      p_total: usage.totalTokens,
    });

    if (error) throw new Error(`token_usage.record failed: ${error.message}`);
  }

  async total(uid: string): Promise<TokenUsage> {
    const zero = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const profileId = await this.profiles.resolveId(uid);
    if (!profileId) return zero;

    const { data, error } = await this.db
      .from("token_usage")
      .select("input_tokens, output_tokens, total_tokens")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (error) throw new Error(`token_usage.total failed: ${error.message}`);
    if (!data) return zero;

    return {
      inputTokens: data.input_tokens,
      outputTokens: data.output_tokens,
      totalTokens: data.total_tokens,
    };
  }
}
