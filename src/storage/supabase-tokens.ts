import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types.js";
import type { ProfileStore } from "./profiles.js";
import type { StoredGoogleConnection, TokenStore } from "./tokens.js";

/**
 * Supabase-backed TokenStore. Resolves the Telegram uid to a profile (creating one if
 * needed on write) and reads/writes the matching `google_connections` row. `delete` is a
 * soft revoke (`revoked_at`); `get` ignores revoked rows.
 */
export class SupabaseTokenStore implements TokenStore {
  constructor(
    private readonly db: SupabaseClient<Database>,
    private readonly profiles: ProfileStore,
  ) {}

  async get(uid: string): Promise<StoredGoogleConnection | null> {
    const profileId = await this.profiles.resolveId(uid);
    if (!profileId) return null;

    const { data, error } = await this.db
      .from("google_connections")
      .select("refresh_token_enc, google_email, scopes")
      .eq("profile_id", profileId)
      .is("revoked_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`google_connections.get failed: ${error.message}`);
    if (!data) return null;

    return {
      refreshTokenEnc: data.refresh_token_enc,
      googleEmail: data.google_email,
      scopes: data.scopes,
    };
  }

  async set(uid: string, conn: StoredGoogleConnection): Promise<void> {
    const profileId = await this.profiles.upsert({ telegramId: uid });

    const { error } = await this.db.from("google_connections").upsert(
      {
        profile_id: profileId,
        google_email: conn.googleEmail,
        refresh_token_enc: conn.refreshTokenEnc,
        scopes: conn.scopes,
        revoked_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id, google_email" },
    );

    if (error) throw new Error(`google_connections.set failed: ${error.message}`);
  }

  async delete(uid: string): Promise<void> {
    const profileId = await this.profiles.resolveId(uid);
    if (!profileId) return;

    const { error } = await this.db
      .from("google_connections")
      .update({ revoked_at: new Date().toISOString() })
      .eq("profile_id", profileId)
      .is("revoked_at", null);

    if (error) throw new Error(`google_connections.delete failed: ${error.message}`);
  }
}
