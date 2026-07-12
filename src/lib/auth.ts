import "server-only";

import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { createOpaqueToken, digestNetworkValue, digestToken } from "./security";

const SESSION_COOKIE = "streak_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

export type SafeUser = Pick<
  typeof users.$inferSelect,
  | "id"
  | "username"
  | "displayName"
  | "role"
  | "bio"
  | "pronouns"
  | "timezone"
  | "emoji"
  | "avatarPath"
  | "mustChangePassword"
  | "leaderboardVisible"
  | "profileVisible"
  | "inviteCodeHint"
>;

export async function createSession(userId: string): Promise<void> {
  const token = createOpaqueToken();
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await db.insert(sessions).values({
    userId,
    tokenDigest: digestToken(token),
    expiresAt,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 300),
    ipDigest: forwardedFor ? digestNetworkValue(forwardedFor) : null,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenDigest, digestToken(token)));
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [result] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      bio: users.bio,
      pronouns: users.pronouns,
      timezone: users.timezone,
      emoji: users.emoji,
      avatarPath: users.avatarPath,
      mustChangePassword: users.mustChangePassword,
      leaderboardVisible: users.leaderboardVisible,
      profileVisible: users.profileVisible,
      inviteCodeHint: users.inviteCodeHint,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenDigest, digestToken(token)),
        gt(sessions.expiresAt, new Date()),
        isNull(users.disabledAt),
      ),
    )
    .limit(1);

  return result ?? null;
}

export async function requireUser(options?: {
  allowPasswordChange?: boolean;
}): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !options?.allowPasswordChange) {
    redirect("/change-password");
  }
  return user;
}

export async function requireSuperAdmin(): Promise<SafeUser> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/dashboard");
  return user;
}
