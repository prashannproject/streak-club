import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import {
  digestInviteCode,
  generateInviteCode,
  isValidUsername,
  normalizeUsername,
} from "../src/lib/identity";
import { hashPassword } from "../src/lib/security";

async function main() {
  const username = normalizeUsername(process.env.BOOTSTRAP_USERNAME ?? "");
  const displayName = process.env.BOOTSTRAP_DISPLAY_NAME?.trim();
  const password = process.env.BOOTSTRAP_PASSWORD;
  if (!isValidUsername(username) || !displayName || !password) {
    throw new Error(
      "Set valid BOOTSTRAP_USERNAME, BOOTSTRAP_DISPLAY_NAME and BOOTSTRAP_PASSWORD.",
    );
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = ${username}`)
    .limit(1);
  if (existing) throw new Error("That username already exists; bootstrap is one-time only.");

  const inviteCode = generateInviteCode();
  await db.insert(users).values({
    username,
    displayName,
    passwordHash: await hashPassword(password),
    role: "SUPER_ADMIN",
    inviteCodeDigest: digestInviteCode(inviteCode),
    inviteCodeHint: inviteCode.slice(-4),
    mustChangePassword: true,
    emoji: "⚡",
  });

  console.log(`Super admin @${username} created.`);
  console.log(`Invite code (shown once): ${inviteCode}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Bootstrap failed.");
    process.exit(1);
  });
