import { describe, expect, it } from "vitest";
import { detectLink, detectSensitiveInfo, detectUnverifiedAccusation } from "./moderation.js";

describe("detectSensitiveInfo", () => {
  it("blocks an email address", () => {
    expect(detectSensitiveInfo("reach me at student@gmail.com").blocked).toBe(true);
  });

  it("blocks a phone number", () => {
    expect(detectSensitiveInfo("call me at 987-654-3210").blocked).toBe(true);
  });

  it("blocks a physical address", () => {
    expect(detectSensitiveInfo("I live at 123 Main Street").blocked).toBe(true);
  });

  it("blocks an explicit password share", () => {
    expect(detectSensitiveInfo("password: hunter2").blocked).toBe(true);
    expect(detectSensitiveInfo("otp=583920").blocked).toBe(true);
  });

  it("blocks an explicit student id share", () => {
    expect(detectSensitiveInfo("student id: 12345678").blocked).toBe(true);
  });

  it("does not false-positive on ordinary password chatter", () => {
    expect(detectSensitiveInfo("I forgot my password today, ugh").blocked).toBe(false);
    expect(detectSensitiveInfo("the wifi password keeps changing").blocked).toBe(false);
  });

  it("does not false-positive on ordinary student-id chatter", () => {
    expect(detectSensitiveInfo("what's the student id format for freshmen?").blocked).toBe(false);
    expect(detectSensitiveInfo("my roll no is stuck in the system").blocked).toBe(false);
  });

  it("allows an ordinary campus post", () => {
    expect(detectSensitiveInfo("The canteen food was actually good today").blocked).toBe(false);
  });

  it("does not block short numbers like times or room numbers", () => {
    expect(detectSensitiveInfo("meet at 5pm in room 204").blocked).toBe(false);
  });
});

describe("detectLink", () => {
  it("blocks an explicit https URL", () => {
    expect(detectLink("check this out https://example.com/event").blocked).toBe(true);
  });

  it("blocks a www.-prefixed link with no protocol", () => {
    expect(detectLink("go to www.example.com for details").blocked).toBe(true);
  });

  it("blocks a bare domain with a common TLD", () => {
    expect(detectLink("follow us on instagram.com/campusimi").blocked).toBe(true);
  });

  it("allows ordinary text containing sentence punctuation", () => {
    expect(detectLink("Great job. Really impressive!").blocked).toBe(false);
    expect(detectLink("I got a 3.5 GPA this semester").blocked).toBe(false);
  });

  it("allows ordinary text with no links", () => {
    expect(detectLink("The canteen food was actually good today").blocked).toBe(false);
  });
});

describe("detectUnverifiedAccusation", () => {
  it("flags an accusation as advisory only (never blocks)", () => {
    const result = detectUnverifiedAccusation("I heard John cheated on the exam");
    expect(result.blocked).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("returns no warning for ordinary posts", () => {
    const result = detectUnverifiedAccusation("The library seat thief strikes again");
    expect(result.blocked).toBe(false);
    expect(result.reason).toBeUndefined();
  });
});
