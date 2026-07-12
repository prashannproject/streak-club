import { beforeEach, describe, expect, it } from "vitest";
import {
  digestInviteCode,
  generateInviteCode,
  isValidUsername,
  normalizeUsername,
  usernameSuggestions,
} from "./identity";

beforeEach(() => {
  process.env.INVITE_CODE_SECRET = "test-invite-secret-that-is-longer-than-32-characters";
});

describe("usernames", () => {
  it("normalizes and validates safe usernames", () => {
    expect(normalizeUsername("  Bestie.EXE ")).toBe("bestie.exe");
    expect(isValidUsername("bestie.exe")).toBe(true);
    expect(isValidUsername("-bad")).toBe(false);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("bad space")).toBe(false);
  });

  it("suggests only available deterministic alternatives", () => {
    const unavailable = new Set(["bestie2", "bestie3"]);
    expect(usernameSuggestions("Bestie!", unavailable)).toEqual([
      "bestie4",
      "bestie5",
      "bestie6",
    ]);
  });
});

describe("invite codes", () => {
  it("creates human-readable codes and deterministic keyed digests", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(digestInviteCode("ABCD2345")).toBe(digestInviteCode("abcd2345"));
    expect(digestInviteCode("ABCD2345")).not.toContain("ABCD2345");
  });
});
