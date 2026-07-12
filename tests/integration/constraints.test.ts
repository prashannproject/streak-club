import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const client = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
const marker = crypto.randomUUID().slice(0, 8);
const ownerUsername = `owner.${marker}`;
const memberUsername = `member.${marker}`;
let ownerId = "";
let memberId = "";
let groupId = "";
let habitId = "";

run("database concurrency constraints", () => {
  beforeAll(async () => {
    if (!client) return;
    const [owner] = await client<{ id: string }[]>`
      INSERT INTO users (
        username, display_name, password_hash, invite_code_digest, invite_code_hint,
        must_change_password
      ) VALUES (
        ${ownerUsername}, 'Constraint Owner', 'test-hash',
        ${"a".repeat(64)}, 'AAAA', false
      ) RETURNING id
    `;
    ownerId = owner.id;
    const [member] = await client<{ id: string }[]>`
      INSERT INTO users (
        username, display_name, password_hash, invite_code_digest, invite_code_hint,
        must_change_password
      ) VALUES (
        ${memberUsername}, 'Constraint Member', 'test-hash',
        ${"b".repeat(64)}, 'BBBB', false
      ) RETURNING id
    `;
    memberId = member.id;
    const [group] = await client<{ id: string }[]>`
      INSERT INTO groups (name, owner_id) VALUES ('Constraint Club', ${ownerId})
      RETURNING id
    `;
    groupId = group.id;
    await client`
      INSERT INTO group_memberships (group_id, user_id, role)
      VALUES (${groupId}, ${ownerId}, 'OWNER')
    `;
    const [habit] = await client<{ id: string }[]>`
      INSERT INTO habits (group_id, name, created_by_id)
      VALUES (${groupId}, 'Constraint Habit', ${ownerId})
      RETURNING id
    `;
    habitId = habit.id;
  });

  afterAll(async () => {
    if (!client) return;
    if (groupId) await client`DELETE FROM groups WHERE id = ${groupId}`;
    if (ownerId || memberId) {
      await client`DELETE FROM users WHERE id IN (${ownerId}, ${memberId})`;
    }
    await client.end();
  });

  it("enforces case-insensitive username uniqueness", async () => {
    await expect(
      client!`
        INSERT INTO users (
          username, display_name, password_hash, invite_code_digest, invite_code_hint
        ) VALUES (
          ${ownerUsername.toUpperCase()}, 'Duplicate', 'test-hash',
          ${"c".repeat(64)}, 'CCCC'
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("enforces one daily check-in per person and habit", async () => {
    await client!`
      INSERT INTO check_ins (habit_id, user_id, local_date)
      VALUES (${habitId}, ${ownerId}, '2026-07-11')
    `;
    await expect(
      client!`
        INSERT INTO check_ins (habit_id, user_id, local_date)
        VALUES (${habitId}, ${ownerId}, '2026-07-11')
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("enforces one pending group invitation per recipient", async () => {
    await client!`
      INSERT INTO invitations (group_id, inviter_id, recipient_id)
      VALUES (${groupId}, ${ownerId}, ${memberId})
    `;
    await expect(
      client!`
        INSERT INTO invitations (group_id, inviter_id, recipient_id)
        VALUES (${groupId}, ${ownerId}, ${memberId})
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });
});
