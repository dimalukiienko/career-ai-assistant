import type { Hono } from "hono";
import type { Deps } from "../../deps.js";
import { verifyStartLink, createOAuthState, verifyOAuthState } from "../../auth/state.js";
import { buildAuthUrl, exchangeCode } from "../../google/oauth.js";

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;text-align:center;color:#222}h1{font-size:1.4rem}p{color:#555}</style></head><body><h1>${title}</h1><p>${body}</p></body></html>`;
}

/**
 * Google OAuth routes:
 *   GET /oauth/google/start    — verifies the bot-signed link, mints fresh state, redirects to consent.
 *   GET /oauth/google/callback — verifies state, exchanges the code, stores the encrypted refresh token.
 */
export function registerOAuth(app: Hono, deps: Deps): void {
  app.get("/oauth/google/start", (c) => {
    const uid = c.req.query("u");
    const sig = c.req.query("sig");
    if (!uid || !sig || !verifyStartLink(uid, sig)) {
      return c.html(page("Invalid link", "This connection link is invalid or expired. Please request a new one from the bot."), 400);
    }
    return c.redirect(buildAuthUrl(createOAuthState(uid)));
  });

  app.get("/oauth/google/callback", async (c) => {
    const error = c.req.query("error");
    if (error) {
      return c.html(page("Connection cancelled", `Google reported: ${error}. You can return to the chat and try again.`), 400);
    }

    const code = c.req.query("code");
    const state = c.req.query("state");
    const verified = state ? verifyOAuthState(state) : null;
    if (!code || !verified) {
      return c.html(page("Invalid request", "Missing or expired authorization. Please start again from the bot."), 400);
    }

    try {
      const tokens = await exchangeCode(code);
      if (!tokens.refresh_token) {
        return c.html(
          page(
            "Couldn't finish connecting",
            "Google didn't return a refresh token. Remove this app's access at myaccount.google.com/permissions, then connect again from the bot.",
          ),
          400,
        );
      }

      await deps.tokens.set(verified.uid, {
        refreshTokenEnc: await deps.encryptor.encrypt(tokens.refresh_token),
        accessToken: tokens.access_token ?? undefined,
        expiryDate: tokens.expiry_date ?? undefined,
        scope: tokens.scope ?? undefined,
        tokenType: tokens.token_type ?? undefined,
      });

      return c.html(page("✅ Connected", "Your Google account is connected. Return to Telegram and ask me anything."));
    } catch (err) {
      console.error("[oauth] callback failed:", err);
      return c.html(page("Something went wrong", "We couldn't complete the connection. Please try again from the bot."), 500);
    }
  });
}
