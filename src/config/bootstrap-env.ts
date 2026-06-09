import { existsSync } from "node:fs";

/**
 * Load a local .env file when present (dev). In production (Cloud Run) env vars are
 * injected directly and no file exists, so this is a no-op there.
 *
 * Import this FIRST in any entrypoint, before modules that read process.env.
 */
const envFile = process.env.ENV_FILE ?? ".env";
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
