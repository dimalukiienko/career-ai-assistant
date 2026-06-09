import type { ModelMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../types/database.types.js";
import type { ProfileStore } from "./profiles.js";
import type { ActiveSession, SessionStore } from "./sessions.js";

/**
 * Supabase-backed SessionStore. Resolves the Telegram uid to a profile (creating one on
 * write) and reads/writes its single active (`ended_at is null`) `conversation_sessions` row.
 * `reset`/`rotateWithSummary` soft-close the active row by stamping `ended_at`.
 */
export class SupabaseSessionStore implements SessionStore {
  constructor(
    private readonly db: SupabaseClient<Database>,
    private readonly profiles: ProfileStore,
  ) {}

  async getActive(uid: string): Promise<ActiveSession> {
    // upsert (not resolveId) so the FK is guaranteed before we may insert a session row.
    const profileId = await this.profiles.upsert({ telegramId: uid });

    const { data, error } = await this.db
      .from("conversation_sessions")
      .select("id, messages, summary, token_count")
      .eq("profile_id", profileId)
      .is("ended_at", null)
      .maybeSingle();

    if (error) throw new Error(`conversation_sessions.getActive failed: ${error.message}`);
    if (data) {
      return {
        id: data.id,
        messages: (data.messages ?? []) as unknown as ModelMessage[],
        summary: data.summary,
        tokenCount: data.token_count,
      };
    }

    const inserted = await this.db
      .from("conversation_sessions")
      .insert({ profile_id: profileId })
      .select("id, messages, summary, token_count")
      .single();

    if (inserted.error)
      throw new Error(`conversation_sessions.getActive insert failed: ${inserted.error.message}`);

    return {
      id: inserted.data.id,
      messages: (inserted.data.messages ?? []) as unknown as ModelMessage[],
      summary: inserted.data.summary,
      tokenCount: inserted.data.token_count,
    };
  }

  async append(uid: string, messages: ModelMessage[], tokenCount: number): Promise<void> {
    const active = await this.getActive(uid);
    const next = [...active.messages, ...messages];

    const { error } = await this.db
      .from("conversation_sessions")
      .update({
        messages: next as unknown as Json,
        token_count: tokenCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", active.id);

    if (error) throw new Error(`conversation_sessions.append failed: ${error.message}`);
  }

  async reset(uid: string): Promise<void> {
    const profileId = await this.profiles.resolveId(uid);
    if (!profileId) return;

    const { error } = await this.db
      .from("conversation_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("profile_id", profileId)
      .is("ended_at", null);

    if (error) throw new Error(`conversation_sessions.reset failed: ${error.message}`);
  }

  async rotateWithSummary(uid: string, summary: string): Promise<void> {
    await this.reset(uid);
    const profileId = await this.profiles.upsert({ telegramId: uid });

    const { error } = await this.db
      .from("conversation_sessions")
      .insert({ profile_id: profileId, summary });

    if (error) throw new Error(`conversation_sessions.rotateWithSummary failed: ${error.message}`);
  }
}
