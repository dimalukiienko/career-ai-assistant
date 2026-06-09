import "./config/bootstrap-env.js";
import { serve } from "@hono/node-server";
import { env } from "./config/env.js";
import { getDeps } from "./deps.js";
import { createBot } from "./bot/bot.js";
import { createApp } from "./server/app.js";

async function main() {
  const deps = getDeps();
  const bot = createBot(deps);

  // Initialize bot info up front so the first webhook update is handled without a race.
  await bot.init();

  const app = createApp(deps, bot);

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    console.log(`career-ai-assistant listening on :${info.port}`);
    console.log(`webhook URL: ${env.PUBLIC_URL}/telegram/webhook`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
