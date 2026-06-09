/**
 * Telegram user profiles. A profile is the local identity that Google connections hang off
 * (see google_connections). Metadata (username, names, language) is captured from incoming
 * Telegram updates where it's available.
 */
export interface TelegramProfile {
  /** Telegram numeric user id, as a string (matches `uid` used elsewhere). */
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
}

/**
 * Storage seam for profiles. The in-memory impl below is the test seam; the Supabase impl
 * (supabase-profiles.ts) is the runtime default.
 */
export interface ProfileStore {
  /** Create or update the profile for this Telegram user; returns the internal profile id. */
  upsert(p: TelegramProfile): Promise<string>;
  /** Resolve the internal profile id for a Telegram user, or null if none exists. */
  resolveId(telegramId: string): Promise<string | null>;
}

export class InMemoryProfileStore implements ProfileStore {
  private readonly byTelegramId = new Map<string, { id: string; profile: TelegramProfile }>();
  private seq = 0;

  async upsert(p: TelegramProfile): Promise<string> {
    const existing = this.byTelegramId.get(p.telegramId);
    if (existing) {
      existing.profile = p;
      return existing.id;
    }
    const id = `profile-${++this.seq}`;
    this.byTelegramId.set(p.telegramId, { id, profile: p });
    return id;
  }

  async resolveId(telegramId: string): Promise<string | null> {
    return this.byTelegramId.get(telegramId)?.id ?? null;
  }
}
