import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

type RouteContext = { params: Promise<{ filename: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) return new NextResponse("Not found", { status: 404 });

  const { filename } = await params;
  if (filename !== path.basename(filename) || !/^[a-f0-9-]+\.webp$/.test(filename)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.avatarPath, filename))
    .limit(1);
  if (!owner) return new NextResponse("Not found", { status: 404 });

  try {
    const directory = path.join(process.cwd(), "data", "avatars");
    const image = await readFile(path.join(directory, filename));
    return new NextResponse(image, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
