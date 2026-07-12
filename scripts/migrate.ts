import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { getDatabaseUrl } from "../src/lib/database-url";

async function main() {
  const client = postgres(getDatabaseUrl(), { max: 1, prepare: false });
  try {
    await client`
      CREATE TABLE IF NOT EXISTS app_migrations (
        name text PRIMARY KEY,
        checksum varchar(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await client`SELECT pg_advisory_lock(hashtext('streak-club:migrations'))`;

    const directory = path.resolve("drizzle");
    const files = (await readdir(directory))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort();
    for (const name of files) {
      const contents = await readFile(path.join(directory, name), "utf8");
      const checksum = createHash("sha256").update(contents).digest("hex");
      const [applied] = await client<{ checksum: string }[]>`
        SELECT checksum FROM app_migrations WHERE name = ${name}
      `;
      if (applied) {
        if (applied.checksum !== checksum) {
          throw new Error(`Applied migration ${name} was modified.`);
        }
        continue;
      }

      await client.begin(async (transaction) => {
        const statements = contents
          .split("--> statement-breakpoint")
          .map((statement) => statement.trim())
          .filter(Boolean);
        for (const statement of statements) {
          await transaction.unsafe(statement);
        }
        await transaction`
          INSERT INTO app_migrations (name, checksum) VALUES (${name}, ${checksum})
        `;
      });
      console.log(`Applied ${name}`);
    }
  } finally {
    await client`SELECT pg_advisory_unlock(hashtext('streak-club:migrations'))`.catch(
      () => undefined,
    );
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exit(1);
});
