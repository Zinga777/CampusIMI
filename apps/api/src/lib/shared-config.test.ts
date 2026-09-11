import { describe, expect, it } from "vitest";
import { isAllowedCollegeEmail, parseCollegeDomains, RESERVED_DISPLAY_NAMES } from "@campusimi/shared";
import { buildDisplayName, DISPLAY_NAME_ADJECTIVES, DISPLAY_NAME_NOUNS } from "@campusimi/shared";

describe("college domain gating", () => {
  const domains = parseCollegeDomains("cse.college.edu,ece.college.edu,college.edu");

  it("accepts an email on an allowed domain", () => {
    expect(isAllowedCollegeEmail("student@cse.college.edu", domains)).toBe(true);
    expect(isAllowedCollegeEmail("student@college.edu", domains)).toBe(true);
  });

  it("rejects an email on a disallowed domain", () => {
    expect(isAllowedCollegeEmail("student@gmail.com", domains)).toBe(false);
  });

  it("is case-insensitive on the domain", () => {
    expect(isAllowedCollegeEmail("student@CSE.COLLEGE.EDU", domains)).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(isAllowedCollegeEmail("not-an-email", domains)).toBe(false);
  });

  it("parses a comma-separated list and trims whitespace", () => {
    const parsed = parseCollegeDomains(" cse.college.edu , college.edu ");
    expect(parsed.has("cse.college.edu")).toBe(true);
    expect(parsed.has("college.edu")).toBe(true);
  });

  it("returns an empty set for an unset env var", () => {
    expect(parseCollegeDomains(undefined).size).toBe(0);
  });
});

describe("display name generation", () => {
  it("builds a name from the adjective/noun word lists", () => {
    const name = buildDisplayName(0, 0);
    expect(name).toBe(`${DISPLAY_NAME_ADJECTIVES[0]}${DISPLAY_NAME_NOUNS[0]}`);
  });

  it("appends a numeric suffix when provided", () => {
    const name = buildDisplayName(0, 0, 1234);
    expect(name).toBe(`${DISPLAY_NAME_ADJECTIVES[0]}${DISPLAY_NAME_NOUNS[0]}1234`);
  });

  it("wraps indices around the word list length", () => {
    const name = buildDisplayName(DISPLAY_NAME_ADJECTIVES.length, DISPLAY_NAME_NOUNS.length);
    expect(name).toBe(`${DISPLAY_NAME_ADJECTIVES[0]}${DISPLAY_NAME_NOUNS[0]}`);
  });

  it("never generates a reserved name from the word lists alone", () => {
    for (const adj of DISPLAY_NAME_ADJECTIVES) {
      for (const noun of DISPLAY_NAME_NOUNS) {
        const candidate = `${adj}${noun}`.toLowerCase();
        expect(RESERVED_DISPLAY_NAMES).not.toContain(candidate);
      }
    }
  });
});
