import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRole = pgEnum("user_role", ["USER", "SUPER_ADMIN"]);
export const groupRole = pgEnum("group_role", ["OWNER", "ADMIN", "MEMBER"]);
export const invitationStatus = pgEnum("invitation_status", [
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "CANCELLED",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: varchar("username", { length: 24 }).notNull(),
    displayName: varchar("display_name", { length: 60 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("USER"),
    bio: varchar("bio", { length: 160 }).notNull().default(""),
    pronouns: varchar("pronouns", { length: 30 }),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    emoji: varchar("emoji", { length: 16 }).notNull().default("✨"),
    avatarPath: text("avatar_path"),
    inviteCodeDigest: varchar("invite_code_digest", { length: 64 }).notNull(),
    inviteCodeHint: varchar("invite_code_hint", { length: 4 }).notNull(),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    leaderboardVisible: boolean("leaderboard_visible").notNull().default(true),
    profileVisible: boolean("profile_visible").notNull().default(true),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_username_lower_unique").on(sql`lower(${table.username})`),
    check("users_failed_login_nonnegative", sql`${table.failedLoginCount} >= 0`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenDigest: varchar("token_digest", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: varchar("user_agent", { length: 300 }),
    ipDigest: varchar("ip_digest", { length: 64 }),
  },
  (table) => [
    uniqueIndex("sessions_token_digest_unique").on(table.tokenDigest),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 60 }).notNull(),
    description: varchar("description", { length: 240 }).notNull().default(""),
    emoji: varchar("emoji", { length: 16 }).notNull().default("🔥"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("groups_owner_id_idx").on(table.ownerId)],
);

export const groupMemberships = pgTable(
  "group_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: groupRole("role").notNull().default("MEMBER"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("memberships_group_user_unique").on(table.groupId, table.userId),
    index("memberships_user_id_idx").on(table.userId),
  ],
);

export const habits = pgTable(
  "habits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    description: varchar("description", { length: 160 }).notNull().default(""),
    emoji: varchar("emoji", { length: 16 }).notNull().default("✅"),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("habits_group_id_idx").on(table.groupId)],
);

export const checkIns = pgTable(
  "check_ins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    localDate: date("local_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("check_ins_habit_user_date_unique").on(
      table.habitId,
      table.userId,
      table.localDate,
    ),
    index("check_ins_user_date_idx").on(table.userId, table.localDate),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: invitationStatus("status").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [
    index("invitations_recipient_status_idx").on(table.recipientId, table.status),
    uniqueIndex("invitations_one_pending_unique")
      .on(table.groupId, table.recipientId)
      .where(sql`${table.status} = 'PENDING'`),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 80 }).notNull(),
    targetType: varchar("target_type", { length: 40 }),
    targetId: uuid("target_id"),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>(),
    ipDigest: varchar("ip_digest", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_actor_id_idx").on(table.actorId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: varchar("key", { length: 128 }).primaryKey(),
    count: integer("count").notNull().default(1),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check("rate_limits_count_positive", sql`${table.count} > 0`)],
);
