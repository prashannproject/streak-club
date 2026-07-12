import { createHmac, randomBytes } from "node:crypto";
import { getSecret } from "./secrets";

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])?$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  const normalized = normalizeUsername(value);
  return normalized.length >= 3 && normalized.length <= 24 && USERNAME_PATTERN.test(normalized);
}

export function usernameSuggestions(
  requested: string,
  unavailable: ReadonlySet<string>,
  count = 3,
): string[] {
  const base =
    normalizeUsername(requested)
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 18) || "clubber";
  const results: string[] = [];

  for (let suffix = 2; results.length < count && suffix < 10_000; suffix += 1) {
    const candidate = `${base}${suffix}`;
    if (!unavailable.has(candidate)) results.push(candidate);
  }

  return results;
}

export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function digestInviteCode(code: string): string {
  const secret = getSecret("INVITE_CODE_SECRET");
  return createHmac("sha256", secret).update(code.trim().toUpperCase()).digest("hex");
}
