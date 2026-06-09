import { describe, it, expect } from "vitest";
import { toGmailDate, gmailDateQuery } from "../src/google/gmail.js";

describe("toGmailDate", () => {
  it("converts YYYY-MM-DD to YYYY/MM/DD", () => {
    expect(toGmailDate("2026-06-09")).toBe("2026/06/09");
  });

  it("accepts a full ISO timestamp", () => {
    expect(toGmailDate("2026-06-09T13:45:00Z")).toBe("2026/06/09");
  });

  it("throws on garbage input", () => {
    expect(() => toGmailDate("last tuesday")).toThrow();
  });
});

describe("gmailDateQuery", () => {
  it("combines after, before, and free-text", () => {
    expect(
      gmailDateQuery({ after: "2026-06-01", before: "2026-06-08", query: "from:recruiter" }),
    ).toBe("after:2026/06/01 before:2026/06/08 from:recruiter");
  });

  it("omits unset parts", () => {
    expect(gmailDateQuery({ after: "2026-06-01" })).toBe("after:2026/06/01");
    expect(gmailDateQuery({})).toBe("");
  });
});
