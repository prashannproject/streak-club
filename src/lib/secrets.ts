import { readFileSync } from "node:fs";

export function getSecret(name: "SESSION_SECRET" | "INVITE_CODE_SECRET"): string {
  const direct = process.env[name];
  const file = process.env[`${name}_FILE`];
  const value = direct ?? (file ? readFileSync(file, "utf8").trim() : undefined);
  if (!value || value.length < 32) {
    throw new Error(`${name} must be at least 32 characters`);
  }
  return value;
}
