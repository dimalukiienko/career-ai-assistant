import { describe, it, expect } from "vitest";
import { containsUrl, contextualInstructions } from "../src/agent/agent.js";

describe("containsUrl", () => {
  it("detects https and http URLs", () => {
    expect(containsUrl("save this job: https://jobs.example.com/senior-eng")).toBe(true);
    expect(containsUrl("here http://example.com")).toBe(true);
  });

  it("ignores plain prose, including the bare word 'http'", () => {
    expect(containsUrl("can you summarize my week")).toBe(false);
    expect(containsUrl("the http protocol is text-based")).toBe(false);
  });
});

describe("contextualInstructions", () => {
  it("adds the offer-to-fetch hint when the text has a URL", () => {
    const lines = contextualInstructions("add this role https://jobs.example.com/x");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("fetch_job_posting");
  });

  it("returns no extra lines without a URL", () => {
    expect(contextualInstructions("what's on my calendar tomorrow")).toEqual([]);
  });
});
