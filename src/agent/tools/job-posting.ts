import { tool } from "ai";
import { z } from "zod";
import * as cheerio from "cheerio";
import type { Deps } from "../../deps.js";
import type { UserContext } from "./shared.js";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_CHARS = 12_000; // keep the tool result from blowing up the model context
const MIN_USEFUL_CHARS = 200; // below this we assume a login/bot wall

// Some sites 403 the default Node fetch UA, so pose as a real browser.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function jobPostingTools(_ctx: UserContext, _deps: Deps) {
  return {
    fetch_job_posting: tool({
      description:
        "Fetch a job-posting web page by URL and return its visible text so you " +
        "can summarize the role, requirements, and company. Use this when the user " +
        "shares a link to a vacancy. If it returns status 'blocked' or 'error', ask " +
        "the user to paste the job description text instead.",
      inputSchema: z.object({
        url: z.string().url().describe("Full https URL of the job posting"),
      }),
      execute: async ({ url }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        let html: string;
        try {
          const res = await fetch(url, {
            signal: controller.signal,
            redirect: "follow",
            headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
          });
          if (!res.ok) {
            return {
              status: "error" as const,
              url,
              message: `The page returned HTTP ${res.status}.`,
            };
          }
          html = await res.text();
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          return { status: "error" as const, url, message: `Could not fetch the page: ${reason}.` };
        } finally {
          clearTimeout(timer);
        }

        const $ = cheerio.load(html);
        $("script, style, noscript, nav, header, footer").remove();
        const title = ($("title").first().text() || $("h1").first().text()).trim();
        const root = $("main").length ? $("main") : $("body");
        const text = root.text().replace(/\s+/g, " ").trim();

        if (text.length < MIN_USEFUL_CHARS) {
          return {
            status: "blocked" as const,
            url,
            message: "The page returned little or no text — likely a login or bot wall.",
          };
        }

        const truncated = text.length > MAX_CHARS;
        return {
          status: "ok" as const,
          url,
          title,
          text: truncated ? text.slice(0, MAX_CHARS) : text,
          truncated,
        };
      },
    }),
  };
}
