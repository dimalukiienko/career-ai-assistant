import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types.js";
import type { ProfileStore, TelegramProfile } from "./profiles.js";

/** Supabase-backed ProfileStore. Upserts on the unique `telegram_id`. */
export class SupabaseProfileStore implements ProfileStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async upsert(p: TelegramProfile): Promise<string> {
    const { data, error } = await this.db
      .from("profiles")
      .upsert(
        {
          telegram_id: Number(p.telegramId),
          telegram_username: p.username ?? null,
          first_name: p.firstName ?? null,
          last_name: p.lastName ?? null,
          language_code: p.languageCode ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "telegram_id" },
      )
      .select("id")
      .single();

    if (error) throw new Error(`profiles.upsert failed: ${error.message}`);
    return data.id;
  }

  async resolveId(telegramId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from("profiles")
      .select("id")
      .eq("telegram_id", Number(telegramId))
      .maybeSingle();

    if (error) throw new Error(`profiles.resolveId failed: ${error.message}`);
    return data?.id ?? null;
  }
}
