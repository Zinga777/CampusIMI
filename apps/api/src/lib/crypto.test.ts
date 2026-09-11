import { describe, expect, it } from "vitest";
import { generateOtp, hashPassword, randomId, randomToken, sha256Hex, verifyPassword } from "./crypto.js";

describe("password hashing", () => {
  it("round-trips a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different hash (different salt) for the same password each time", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("rejects a malformed stored hash instead of throwing", async () => {
    expect(await verifyPassword("anything", "not-a-real-hash")).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("is deterministic", async () => {
    expect(await sha256Hex("hello")).toBe(await sha256Hex("hello"));
  });

  it("differs for different input", async () => {
    expect(await sha256Hex("hello")).not.toBe(await sha256Hex("world"));
  });
});

describe("randomId / randomToken", () => {
  it("generates unique values", () => {
    expect(randomId()).not.toBe(randomId());
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe("generateOtp", () => {
  it("always generates a 6-digit numeric code", () => {
    for (let i = 0; i < 20; i++) {
      const otp = generateOtp();
      expect(otp).toMatch(/^\d{6}$/);
    }
  });
});
