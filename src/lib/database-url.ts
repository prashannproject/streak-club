import { readFileSync } from "node:fs";

export function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const passwordFile = process.env.DB_PASSWORD_FILE;
  const password = passwordFile ? readFileSync(passwordFile, "utf8").trim() : process.env.DB_PASSWORD;
  const host = process.env.DB_HOST;
  const name = process.env.DB_NAME;
  const user = process.env.DB_USER;

  if (!password || !host || !name || !user) {
    throw new Error(
      "Set DATABASE_URL or DB_HOST, DB_NAME, DB_USER and DB_PASSWORD_FILE.",
    );
  }

  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:5432/${encodeURIComponent(name)}`;
}
