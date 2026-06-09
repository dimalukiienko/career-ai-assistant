/** Per-message context handed to every tool factory. */
export interface UserContext {
  /** Telegram user id (also the storage key). */
  uid: string;
  /** Pre-signed link that starts Google OAuth for this user. */
  oauthUrl: string;
}

/** Standard "not connected" result. The system prompt tells the model to relay the link. */
export function needsAuth(ctx: UserContext) {
  return {
    status: "needs_auth" as const,
    message:
      "The user has not connected their Google account yet. Share the authUrl with them so they can connect, then stop.",
    authUrl: ctx.oauthUrl,
  };
}
