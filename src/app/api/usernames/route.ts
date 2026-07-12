import { ilike, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { rateLimits, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import {
  isValidUsername,
  normalizeUsername,
  usernameSuggestions,
} from "@/lib/identity";

export async function GET(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) return new NextResponse("Not found", { status: 404 });

  const key = `username-lookup:${viewer.id}`;
  const cutoff = new Date(Date.now() - 60_000);
  const cutoffTimestamp = cutoff.toISOString();
  const [limit] = await db
    .insert(rateLimits)
    .values({ key })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.windowStartedAt} < ${cutoffTimestamp}::timestamptz THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${rateLimits.windowStartedAt} < ${cutoffTimestamp}::timestamptz THEN now() ELSE ${rateLimits.windowStartedAt} END`,
      },
    })
    .returning();
  if (limit.count > 30 && limit.windowStartedAt >= cutoff) {
    return NextResponse.json({ error: "Slow down." }, { status: 429 });
  }

  const parsed = z.string().max(24).safeParse(new URL(request.url).searchParams.get("q"));
  if (!parsed.success) return NextResponse.json({ available: false, suggestions: [] });
  const requested = normalizeUsername(parsed.data);
  if (!isValidUsername(requested)) {
    return NextResponse.json({ available: false, suggestions: [] });
  }

  const nearby = await db
    .select({ username: users.username })
    .from(users)
    .where(ilike(users.username, `${requested.replace(/[%_]/g, "\\$&")}%`))
    .limit(50);
  const unavailable = new Set(nearby.map((item) => item.username.toLowerCase()));
  return NextResponse.json({
    available: !unavailable.has(requested),
    suggestions: unavailable.has(requested)
      ? usernameSuggestions(requested, unavailable)
      : [],
  });
}
