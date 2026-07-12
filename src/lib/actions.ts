"use server";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  checkIns,
  groupMemberships,
  groups,
  habits,
  invitations,
  rateLimits,
  sessions,
  users,
} from "@/db/schema";
import {
  createSession,
  destroyAllSessions,
  destroySession,
  requireSuperAdmin,
  requireUser,
} from "./auth";
import {
  digestInviteCode,
  generateInviteCode,
  isValidUsername,
  normalizeUsername,
} from "./identity";
import { canManageGroup, limitFor } from "./policy";
import {
  digestNetworkValue,
  hashPassword,
  safeEqual,
  validatePassword,
  verifyPassword,
} from "./security";
import { publicActionError, SafeActionError } from "./action-errors";

export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  inviteCode?: string;
};

const text = (max: number) => z.string().trim().min(1).max(max);
const uuid = z.string().uuid();

async function assertTrustedOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const allowedOrigin = process.env.APP_ORIGIN;
  if (origin && allowedOrigin && origin !== allowedOrigin) {
    throw new Error("Untrusted request origin");
  }
}

async function requestIpDigest() {
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded ? digestNetworkValue(forwarded) : null;
}

async function audit(
  action: string,
  actorId?: string,
  targetType?: string,
  targetId?: string,
  metadata?: Record<string, string | number | boolean | null>,
) {
  await db.insert(auditLogs).values({
    actorId,
    action,
    targetType,
    targetId,
    metadata,
    ipDigest: await requestIpDigest(),
  });
}

async function enforceRateLimit(
  key: string,
  maximum: number,
  windowSeconds: number,
) {
  const now = new Date();
  const resetBefore = new Date(now.getTime() - windowSeconds * 1000);
  const nowTimestamp = now.toISOString();
  const resetTimestamp = resetBefore.toISOString();
  const [record] = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.windowStartedAt} < ${resetTimestamp}::timestamptz THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${rateLimits.windowStartedAt} < ${resetTimestamp}::timestamptz THEN ${nowTimestamp}::timestamptz ELSE ${rateLimits.windowStartedAt} END`,
      },
    })
    .returning();

  if (record.count > maximum && record.windowStartedAt >= resetBefore) {
    throw new SafeActionError("Too many attempts. Take a short break and try again.");
  }
}

export async function loginAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertTrustedOrigin();
  const parsed = z
    .object({ username: text(24), password: z.string().min(1).max(128) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter your username and password." };

  const username = normalizeUsername(parsed.data.username);
  const ipDigest = (await requestIpDigest()) ?? "unknown";
  try {
    await enforceRateLimit(`login:${ipDigest}`, 10, 15 * 60);
  } catch (error) {
    return {
      error: publicActionError(
        error,
        "Unable to sign in right now. Please try again shortly.",
      ),
    };
  }

  const [account] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = ${username}`)
    .limit(1);

  const genericError = { error: "Username or password is incorrect." };
  if (!account || account.disabledAt || (account.lockedUntil && account.lockedUntil > new Date())) {
    return genericError;
  }

  if (!(await verifyPassword(account.passwordHash, parsed.data.password))) {
    const failures = account.failedLoginCount + 1;
    const lockedUntil =
      failures >= 5 ? new Date(Date.now() + Math.min(30, failures) * 60_000) : null;
    await db
      .update(users)
      .set({ failedLoginCount: failures, lockedUntil })
      .where(eq(users.id, account.id));
    await audit("AUTH_LOGIN_FAILED", account.id, "user", account.id);
    return genericError;
  }

  await db
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null })
    .where(eq(users.id, account.id));
  await createSession(account.id);
  await audit("AUTH_LOGIN_SUCCESS", account.id, "user", account.id);
  redirect(account.mustChangePassword ? "/change-password" : "/dashboard");
}

export async function logoutAction() {
  await assertTrustedOrigin();
  await destroySession();
  redirect("/login");
}

export async function changePasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertTrustedOrigin();
  const user = await requireUser({ allowPasswordChange: true });
  const parsed = z
    .object({
      currentPassword: z.string().min(1).max(128),
      newPassword: z.string().min(1).max(128),
      confirmPassword: z.string().min(1).max(128),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Complete all password fields." };
  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return { error: "New passwords do not match." };
  }
  const passwordError = validatePassword(parsed.data.newPassword);
  if (passwordError) return { error: passwordError };

  const [account] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!account || !(await verifyPassword(account.passwordHash, parsed.data.currentPassword))) {
    return { error: "Current password is incorrect." };
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(parsed.data.newPassword),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  await db.delete(sessions).where(eq(sessions.userId, user.id));
  await createSession(user.id);
  await audit("AUTH_PASSWORD_CHANGED", user.id, "user", user.id);
  redirect("/dashboard");
}

export async function createUserAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertTrustedOrigin();
  const admin = await requireSuperAdmin();
  const parsed = z
    .object({
      username: text(24),
      displayName: text(60),
      temporaryPassword: z.string().min(1).max(128),
      role: z.enum(["USER", "SUPER_ADMIN"]).default("USER"),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the account details and try again." };

  const username = normalizeUsername(parsed.data.username);
  if (!isValidUsername(username)) {
    return { error: "Username must be 3–24 characters using letters, numbers, ., _ or -." };
  }
  const passwordError = validatePassword(parsed.data.temporaryPassword);
  if (passwordError) return { error: passwordError };

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = ${username}`)
    .limit(1);
  if (existing) return { error: "That username is already taken." };

  const inviteCode = generateInviteCode();
  const [created] = await db
    .insert(users)
    .values({
      username,
      displayName: parsed.data.displayName,
      passwordHash: await hashPassword(parsed.data.temporaryPassword),
      role: parsed.data.role,
      inviteCodeDigest: digestInviteCode(inviteCode),
      inviteCodeHint: inviteCode.slice(-4),
      mustChangePassword: true,
    })
    .returning({ id: users.id });
  await audit("ADMIN_USER_CREATED", admin.id, "user", created.id, {
    role: parsed.data.role,
  });
  revalidatePath("/admin");
  return {
    ok: true,
    message: `Account @${username} created. Copy the invite code now; it is not stored in readable form.`,
    inviteCode,
  };
}

export async function resetUserPasswordAction(formData: FormData) {
  await assertTrustedOrigin();
  const admin = await requireSuperAdmin();
  const parsed = z
    .object({ userId: uuid, temporaryPassword: z.string().min(1).max(128) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const passwordError = validatePassword(parsed.data.temporaryPassword);
  if (passwordError) return;

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: await hashPassword(parsed.data.temporaryPassword),
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, parsed.data.userId));
    await tx.delete(sessions).where(eq(sessions.userId, parsed.data.userId));
  });
  await audit("ADMIN_PASSWORD_RESET", admin.id, "user", parsed.data.userId);
  revalidatePath("/admin");
}

export async function toggleUserDisabledAction(formData: FormData) {
  await assertTrustedOrigin();
  const admin = await requireSuperAdmin();
  const parsed = z.object({ userId: uuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.userId === admin.id) return;
  const [account] = await db
    .select({ disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .limit(1);
  if (!account) return;
  const disabledAt = account.disabledAt ? null : new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ disabledAt, updatedAt: new Date() })
      .where(eq(users.id, parsed.data.userId));
    if (disabledAt) {
      await tx.delete(sessions).where(eq(sessions.userId, parsed.data.userId));
    }
  });
  await audit(
    disabledAt ? "ADMIN_USER_DISABLED" : "ADMIN_USER_ENABLED",
    admin.id,
    "user",
    parsed.data.userId,
  );
  revalidatePath("/admin");
}

export async function updateProfileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertTrustedOrigin();
  const user = await requireUser();
  const parsed = z
    .object({
      username: text(24),
      displayName: text(60),
      bio: z.string().trim().max(160),
      pronouns: z.string().trim().max(30),
      timezone: text(64),
      emoji: text(16),
      profileVisible: z.string().optional(),
      leaderboardVisible: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check your profile details." };
  const username = normalizeUsername(parsed.data.username);
  if (!isValidUsername(username)) {
    return { error: "Username must be 3–24 characters using letters, numbers, ., _ or -." };
  }
  const [usernameOwner] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = ${username}`)
    .limit(1);
  if (usernameOwner && usernameOwner.id !== user.id) {
    return { error: "That username is taken. Try adding a short word or number." };
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: parsed.data.timezone }).format();
  } catch {
    return { error: "Choose a valid timezone." };
  }

  await db
    .update(users)
    .set({
      username,
      displayName: parsed.data.displayName,
      bio: parsed.data.bio,
      pronouns: parsed.data.pronouns || null,
      timezone: parsed.data.timezone,
      emoji: parsed.data.emoji,
      profileVisible: parsed.data.profileVisible === "on",
      leaderboardVisible: parsed.data.leaderboardVisible === "on",
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  await audit("PROFILE_UPDATED", user.id, "user", user.id);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true, message: "Profile saved." };
}

export async function uploadAvatarAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertTrustedOrigin();
  const user = await requireUser();
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image." };
  if (file.size > 5 * 1024 * 1024) return { error: "Image must be under 5 MB." };
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return { error: "Use a JPEG, PNG, or WebP image." };
  }

  const input = Buffer.from(await file.arrayBuffer());
  let output: Buffer;
  try {
    const { default: sharp } = await import("sharp");
    output = await sharp(input, { failOn: "warning", limitInputPixels: 20_000_000 })
      .rotate()
      .resize(512, 512, { fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { error: "That image could not be processed safely." };
  }

  const directory = path.join(process.cwd(), "data", "avatars");
  await mkdir(directory, { recursive: true, mode: 0o750 });
  const filename = `${user.id}-${crypto.randomUUID()}.webp`;
  await writeFile(path.join(directory, filename), output, { mode: 0o640, flag: "wx" });

  const [previous] = await db
    .select({ avatarPath: users.avatarPath })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  await db
    .update(users)
    .set({ avatarPath: filename, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  if (previous?.avatarPath) {
    await unlink(path.join(directory, path.basename(previous.avatarPath))).catch(() => undefined);
  }
  await audit("AVATAR_UPDATED", user.id, "user", user.id);
  revalidatePath("/settings");
  return { ok: true, message: "Profile picture updated." };
}

export async function deleteAvatarAction() {
  await assertTrustedOrigin();
  const user = await requireUser();
  const [account] = await db
    .select({ avatarPath: users.avatarPath })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (account?.avatarPath) {
    const directory = path.join(process.cwd(), "data", "avatars");
    await unlink(path.join(directory, path.basename(account.avatarPath))).catch(() => undefined);
    await db
      .update(users)
      .set({ avatarPath: null, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }
  await audit("AVATAR_DELETED", user.id, "user", user.id);
  revalidatePath("/settings");
}

export async function clearOptionalProfileDataAction() {
  await assertTrustedOrigin();
  const user = await requireUser();
  const [account] = await db
    .select({ avatarPath: users.avatarPath })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  await db
    .update(users)
    .set({
      bio: "",
      pronouns: null,
      avatarPath: null,
      emoji: "✨",
      profileVisible: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  if (account?.avatarPath) {
    const directory = path.join(process.cwd(), "data", "avatars");
    await unlink(path.join(directory, path.basename(account.avatarPath))).catch(() => undefined);
  }
  await audit("PROFILE_OPTIONAL_DATA_CLEARED", user.id, "user", user.id);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function rotateInviteCodeAction(
  previous: ActionState,
): Promise<ActionState> {
  void previous;
  await assertTrustedOrigin();
  const user = await requireUser();
  const inviteCode = generateInviteCode();
  await db
    .update(users)
    .set({
      inviteCodeDigest: digestInviteCode(inviteCode),
      inviteCodeHint: inviteCode.slice(-4),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  await audit("INVITE_CODE_ROTATED", user.id, "user", user.id);
  revalidatePath("/settings");
  return {
    ok: true,
    message: "New invite code created. Copy it now.",
    inviteCode,
  };
}

export async function createGroupAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertTrustedOrigin();
  const user = await requireUser();
  const parsed = z
    .object({
      name: text(60),
      description: z.string().trim().max(240),
      emoji: text(16),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the group details." };

  try {
    const group = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`groups:${user.id}`}))`);
      const [owned] = await tx
        .select({ value: count() })
        .from(groups)
        .where(and(eq(groups.ownerId, user.id), isNull(groups.archivedAt)));
      if (owned.value >= limitFor("ownedGroups", user.role)) {
        throw new SafeActionError("Free accounts can own up to 2 active groups.");
      }
      const [created] = await tx
        .insert(groups)
        .values({
          name: parsed.data.name,
          description: parsed.data.description,
          emoji: parsed.data.emoji,
          ownerId: user.id,
        })
        .returning();
      await tx.insert(groupMemberships).values({
        groupId: created.id,
        userId: user.id,
        role: "OWNER",
      });
      return created;
    });
    await audit("GROUP_CREATED", user.id, "group", group.id);
    redirect(`/groups/${group.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: publicActionError(error, "Could not create the group.") };
  }
}

export async function updateGroupAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertTrustedOrigin();
  const user = await requireUser();
  const parsed = z
    .object({
      groupId: uuid,
      name: text(60),
      description: z.string().trim().max(240),
      emoji: text(16),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the group details." };

  const membership = await getMembership(parsed.data.groupId, user.id);
  if (!canManageGroup(membership?.role, user.role)) {
    return { error: "You do not have permission to edit this group." };
  }

  try {
    const [updated] = await db
      .update(groups)
      .set({
        name: parsed.data.name,
        description: parsed.data.description,
        emoji: parsed.data.emoji,
        updatedAt: new Date(),
      })
      .where(and(eq(groups.id, parsed.data.groupId), isNull(groups.archivedAt)))
      .returning({ id: groups.id });
    if (!updated) return { error: "Group not found." };
    await audit("GROUP_UPDATED", user.id, "group", updated.id);
    revalidatePath(`/groups/${updated.id}`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Group updated." };
  } catch (error) {
    return { error: publicActionError(error, "Could not update the group.") };
  }
}

export async function deleteGroupAction(formData: FormData) {
  await assertTrustedOrigin();
  const user = await requireUser();
  const parsed = z.object({ groupId: uuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const [target] = await db
    .select({ id: groups.id, ownerId: groups.ownerId })
    .from(groups)
    .where(eq(groups.id, parsed.data.groupId))
    .limit(1);
  if (!target) redirect("/dashboard");
  if (user.role !== "SUPER_ADMIN" && target.ownerId !== user.id) {
    redirect(`/groups/${target.id}`);
  }

  await db.delete(groups).where(eq(groups.id, target.id));
  await audit("GROUP_DELETED", user.id, "group", target.id);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

async function getMembership(groupId: string, userId: string) {
  const [membership] = await db
    .select({ role: groupMemberships.role })
    .from(groupMemberships)
    .where(
      and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)),
    )
    .limit(1);
  return membership;
}

export async function createHabitAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertTrustedOrigin();
  const user = await requireUser();
  const parsed = z
    .object({
      groupId: uuid,
      name: text(60),
      description: z.string().trim().max(160),
      emoji: text(16),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the habit details." };
  const membership = await getMembership(parsed.data.groupId, user.id);
  if (!canManageGroup(membership?.role, user.role)) return { error: "Not allowed." };

  try {
    const created = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`habits:${parsed.data.groupId}`}))`,
      );
      const [active] = await tx
        .select({ value: count() })
        .from(habits)
        .where(
          and(eq(habits.groupId, parsed.data.groupId), isNull(habits.archivedAt)),
        );
      if (active.value >= limitFor("activeHabits", user.role)) {
        throw new SafeActionError("Free groups can have up to 3 active habits.");
      }
      const [habit] = await tx
        .insert(habits)
        .values({
          groupId: parsed.data.groupId,
          name: parsed.data.name,
          description: parsed.data.description,
          emoji: parsed.data.emoji,
          createdById: user.id,
        })
        .returning();
      return habit;
    });
    await audit("HABIT_CREATED", user.id, "habit", created.id);
    revalidatePath(`/groups/${parsed.data.groupId}`);
    return { ok: true, message: "Habit added." };
  } catch (error) {
    return { error: publicActionError(error, "Could not add the habit.") };
  }
}

export async function archiveHabitAction(formData: FormData) {
  await assertTrustedOrigin();
  const user = await requireUser();
  const parsed = z
    .object({ groupId: uuid, habitId: uuid })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const membership = await getMembership(parsed.data.groupId, user.id);
  if (!canManageGroup(membership?.role, user.role)) return;
  await db
    .update(habits)
    .set({ archivedAt: new Date() })
    .where(and(eq(habits.id, parsed.data.habitId), eq(habits.groupId, parsed.data.groupId)));
  await audit("HABIT_ARCHIVED", user.id, "habit", parsed.data.habitId);
  revalidatePath(`/groups/${parsed.data.groupId}`);
}

export async function updateHabitAction(formData: FormData) {
  await assertTrustedOrigin();
  const user = await requireUser();
  const parsed = z
    .object({
      groupId: uuid,
      habitId: uuid,
      name: text(60),
      description: z.string().trim().max(160),
      emoji: text(16),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const membership = await getMembership(parsed.data.groupId, user.id);
  if (!canManageGroup(membership?.role, user.role)) return;
  await db
    .update(habits)
    .set({
      name: parsed.data.name,
      description: parsed.data.description,
      emoji: parsed.data.emoji,
    })
    .where(
      and(
        eq(habits.id, parsed.data.habitId),
        eq(habits.groupId, parsed.data.groupId),
        isNull(habits.archivedAt),
      ),
    );
  await audit("HABIT_UPDATED", user.id, "habit", parsed.data.habitId);
  revalidatePath(`/groups/${parsed.data.groupId}`);
}

export async function sendInvitationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertTrustedOrigin();
  const user = await requireUser();
  const parsed = z
    .object({ groupId: uuid, username: text(24), inviteCode: text(16) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter the exact username and invite code." };
  const membership = await getMembership(parsed.data.groupId, user.id);
  if (!canManageGroup(membership?.role, user.role)) return { error: "Not allowed." };

  try {
    await enforceRateLimit(`invite:${user.id}`, 20, 60 * 60);
    const recipientUsername = normalizeUsername(parsed.data.username);
    const [recipient] = await db
      .select({
        id: users.id,
        inviteCodeDigest: users.inviteCodeDigest,
        disabledAt: users.disabledAt,
      })
      .from(users)
      .where(sql`lower(${users.username}) = ${recipientUsername}`)
      .limit(1);
    if (
      !recipient ||
      recipient.disabledAt ||
      !safeEqual(
        recipient.inviteCodeDigest,
        digestInviteCode(parsed.data.inviteCode),
      )
    ) {
      return { error: "Those invite details do not match an active user." };
    }
    if (recipient.id === user.id) return { error: "You are already here." };

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`members:${parsed.data.groupId}`}))`,
      );
      const [memberCount] = await tx
        .select({ value: count() })
        .from(groupMemberships)
        .where(eq(groupMemberships.groupId, parsed.data.groupId));
      if (memberCount.value >= limitFor("groupMembers", user.role)) {
        throw new SafeActionError("This free group already has 4 members.");
      }
      const [existing] = await tx
        .select({ id: groupMemberships.id })
        .from(groupMemberships)
        .where(
          and(
            eq(groupMemberships.groupId, parsed.data.groupId),
            eq(groupMemberships.userId, recipient.id),
          ),
        )
        .limit(1);
      if (existing) throw new SafeActionError("That person is already in the group.");
      await tx.insert(invitations).values({
        groupId: parsed.data.groupId,
        inviterId: user.id,
        recipientId: recipient.id,
      });
    });
    await audit("INVITATION_SENT", user.id, "group", parsed.data.groupId);
    revalidatePath(`/groups/${parsed.data.groupId}`);
    return { ok: true, message: "Invite sent. They get the final say." };
  } catch (error) {
    return { error: publicActionError(error, "Could not send the invitation.") };
  }
}

export async function respondInvitationAction(formData: FormData) {
  await assertTrustedOrigin();
  const user = await requireUser();
  const parsed = z
    .object({ invitationId: uuid, response: z.enum(["ACCEPTED", "DECLINED"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  await db.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, parsed.data.invitationId),
          eq(invitations.recipientId, user.id),
          eq(invitations.status, "PENDING"),
        ),
      )
      .for("update")
      .limit(1);
    if (!invitation) return;
    if (parsed.data.response === "ACCEPTED") {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`members:${invitation.groupId}`}))`,
      );
      const [memberCount] = await tx
        .select({ value: count() })
        .from(groupMemberships)
        .where(eq(groupMemberships.groupId, invitation.groupId));
      if (memberCount.value >= limitFor("groupMembers", user.role)) {
        throw new SafeActionError("The group filled up before this invite was accepted.");
      }
      await tx
        .insert(groupMemberships)
        .values({ groupId: invitation.groupId, userId: user.id, role: "MEMBER" })
        .onConflictDoNothing();
    }
    await tx
      .update(invitations)
      .set({ status: parsed.data.response, respondedAt: new Date() })
      .where(eq(invitations.id, invitation.id));
  });
  await audit(`INVITATION_${parsed.data.response}`, user.id, "invitation", parsed.data.invitationId);
  revalidatePath("/dashboard");
}

function localDate(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function toggleCheckInAction(formData: FormData) {
  await assertTrustedOrigin();
  const user = await requireUser();
  const parsed = z
    .object({ groupId: uuid, habitId: uuid })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const membership = await getMembership(parsed.data.groupId, user.id);
  if (!membership && user.role !== "SUPER_ADMIN") return;
  const [habit] = await db
    .select({ id: habits.id })
    .from(habits)
    .where(
      and(
        eq(habits.id, parsed.data.habitId),
        eq(habits.groupId, parsed.data.groupId),
        isNull(habits.archivedAt),
      ),
    )
    .limit(1);
  if (!habit) return;
  const date = localDate(user.timezone);
  const [existing] = await db
    .select({ id: checkIns.id })
    .from(checkIns)
    .where(
      and(
        eq(checkIns.habitId, habit.id),
        eq(checkIns.userId, user.id),
        eq(checkIns.localDate, date),
      ),
    )
    .limit(1);
  if (existing) {
    await db.delete(checkIns).where(eq(checkIns.id, existing.id));
    await audit("CHECK_IN_UNDONE", user.id, "habit", habit.id, { date });
  } else {
    await db.insert(checkIns).values({ habitId: habit.id, userId: user.id, localDate: date });
    await audit("CHECK_IN_CREATED", user.id, "habit", habit.id, { date });
  }
  revalidatePath(`/groups/${parsed.data.groupId}`);
  revalidatePath("/dashboard");
}

export async function logoutAllDevicesAction() {
  await assertTrustedOrigin();
  const user = await requireUser();
  await audit("AUTH_LOGOUT_ALL", user.id, "user", user.id);
  await destroyAllSessions(user.id);
  redirect("/login");
}
