import { beforeEach, describe, expect, it } from "vitest";
import {
  createOpaqueToken,
  digestToken,
  hashPassword,
  safeEqual,
  validatePassword,
  verifyPassword,
} from "./security";

beforeEach(() => {
  process.env.SESSION_SECRET = "test-session-secret-that-is-longer-than-32-characters";
});

describe("password security", () => {
  it("rejects weak passwords", () => {
    expect(validatePassword("short")).toBeTruthy();
    expect(validatePassword("alllowercasebutlong1")).toBeTruthy();
    expect(validatePassword("StrongEnough123")).toBeNull();
  });

  it("hashes and verifies passwords without preserving plaintext", async () => {
    const password = "StrongEnough123";
    const hash = await hashPassword(password);
    expect(hash).not.toContain(password);
    expect(await verifyPassword(hash, password)).toBe(true);
    expect(await verifyPassword(hash, "WrongPassword123")).toBe(false);
  });
});

describe("session tokens", () => {
  it("creates opaque tokens and keyed digests", () => {
    const token = createOpaqueToken();
    expect(token.length).toBeGreaterThan(32);
    expect(digestToken(token)).not.toContain(token);
    expect(safeEqual(digestToken(token), digestToken(token))).toBe(true);
    expect(safeEqual("short", "different-length")).toBe(false);
  });
});
