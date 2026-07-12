import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  checkIns,
  groupMemberships,
  groups,
  habits,
  users,
} from "../src/db/schema";
import { digestInviteCode, generateInviteCode } from "../src/lib/identity";
import { hashPassword } from "../src/lib/security";

const demoUsers = [
  { username: "nova.daily", displayName: "Nova", emoji: "🛼" },
  { username: "milo.moves", displayName: "Milo", emoji: "🪩" },
  { username: "sage.mode", displayName: "Sage", emoji: "🌱" },
  { username: "zuri.zip", displayName: "Zuri", emoji: "⚡" },
] as const;

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo seed is disabled in production.");
  }
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error("Set SEED_PASSWORD to a strong temporary demo password.");
  const passwordHash = await hashPassword(password);

  const createdUsers = [];
  for (const demo of demoUsers) {
    const [existing] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = ${demo.username}`)
      .limit(1);
    if (existing) {
      createdUsers.push(existing);
      continue;
    }
    const code = generateInviteCode();
    const [created] = await db
      .insert(users)
      .values({
        ...demo,
        passwordHash,
        inviteCodeDigest: digestInviteCode(code),
        inviteCodeHint: code.slice(-4),
        mustChangePassword: false,
      })
      .returning();
    createdUsers.push(created);
    console.log(`@${demo.username} invite code: ${code}`);
  }

  const [existingGroup] = await db
    .select()
    .from(groups)
    .where(eq(groups.name, "Main Character Mornings"))
    .limit(1);
  if (existingGroup) {
    console.log("Demo group already exists.");
    return;
  }

  const [group] = await db
    .insert(groups)
    .values({
      name: "Main Character Mornings",
      description: "Tiny morning wins before the group chat wakes up.",
      emoji: "🌞",
      ownerId: createdUsers[0].id,
    })
    .returning();
  await db.insert(groupMemberships).values(
    createdUsers.map((user, index) => ({
      groupId: group.id,
      userId: user.id,
      role: index === 0 ? ("OWNER" as const) : ("MEMBER" as const),
    })),
  );
  const createdHabits = await db
    .insert(habits)
    .values([
      {
        groupId: group.id,
        name: "Water before scroll",
        description: "One glass. Phone can wait.",
        emoji: "💧",
        createdById: createdUsers[0].id,
      },
      {
        groupId: group.id,
        name: "Ten-minute move",
        description: "Walk, dance, stretch — all valid.",
        emoji: "🛼",
        createdById: createdUsers[0].id,
      },
      {
        groupId: group.id,
        name: "Make the bed-ish",
        description: "Good enough is genuinely enough.",
        emoji: "🛏️",
        createdById: createdUsers[0].id,
      },
    ])
    .returning();
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(checkIns).values([
    { userId: createdUsers[0].id, habitId: createdHabits[0].id, localDate: today },
    { userId: createdUsers[0].id, habitId: createdHabits[1].id, localDate: today },
    { userId: createdUsers[1].id, habitId: createdHabits[0].id, localDate: today },
    { userId: createdUsers[2].id, habitId: createdHabits[2].id, localDate: today },
  ]);
  console.log("Demo group and habits created.");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Seed failed.");
    process.exit(1);
  });
