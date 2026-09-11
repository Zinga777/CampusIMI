import { describe, expect, it } from "vitest";
import { isValidEmailShape, isValidPassword } from "./validation.js";

describe("isValidEmailShape", () => {
  it("accepts a well-formed email", () => {
    expect(isValidEmailShape("student@college.edu")).toBe(true);
  });

  it("rejects missing @ or domain", () => {
    expect(isValidEmailShape("not-an-email")).toBe(false);
    expect(isValidEmailShape("student@")).toBe(false);
    expect(isValidEmailShape("student@college")).toBe(false);
  });
});

describe("isValidPassword", () => {
  it("accepts an 8+ character password", () => {
    expect(isValidPassword("password123")).toBe(true);
  });

  it("rejects a short password", () => {
    expect(isValidPassword("short")).toBe(false);
  });
});
