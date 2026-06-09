import type { Hono } from "hono";

/** Liveness/readiness probe for Cloud Run. */
export function registerHealth(app: Hono): void {
  app.get("/", (c) => c.json({ ok: true, service: "career-ai-assistant" }));
}
