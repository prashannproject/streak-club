import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { getDatabaseUrl } from "@/lib/database-url";

const connectionString = getDatabaseUrl();

const globalForDb = globalThis as unknown as {
  sqlClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.sqlClient ??
  postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? 10 : 2,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.sqlClient = client;
}

export const db = drizzle(client, { schema });
export type Database = typeof db;
