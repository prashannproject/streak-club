import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { AppShell, Avatar } from "@/components/app-shell";
import { CreateUserForm } from "@/components/forms";
import { db } from "@/db";
import { groups, users } from "@/db/schema";
import {
  resetUserPasswordAction,
  toggleUserDisabledAction,
} from "@/lib/actions";
import { requireSuperAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Super admin" };

export default async function AdminPage() {
  const admin = await requireSuperAdmin();
  const [accounts, allGroups] = await Promise.all([
    db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        emoji: users.emoji,
        avatarPath: users.avatarPath,
        role: users.role,
        disabledAt: users.disabledAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt)),
    db
      .select({
        id: groups.id,
        name: groups.name,
        emoji: groups.emoji,
        createdAt: groups.createdAt,
      })
      .from(groups)
      .orderBy(desc(groups.createdAt)),
  ]);

  return (
    <AppShell user={admin}>
      <section className="heroRow compactHero">
        <div>
          <span className="eyebrow">SUPER ADMIN</span>
          <h1>Keep the pilot<br />healthy.</h1>
          <p className="lede">Provision carefully. Every admin action is audited.</p>
        </div>
        <Link href="/groups/new" className="button primary">Create unlimited group</Link>
      </section>

      <section className="panel glass sectionBlock">
        <div className="sectionHeading">
          <div>
            <span className="eyebrow">PROVISION</span>
            <h2>Create an account</h2>
          </div>
          <span className="countPill">{accounts.length} users</span>
        </div>
        <CreateUserForm />
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <span className="eyebrow">PEOPLE</span>
            <h2>Account controls</h2>
          </div>
        </div>
        <div className="adminList">
          {accounts.map((account) => (
            <article className={`adminRow glass ${account.disabledAt ? "disabled" : ""}`} key={account.id}>
              <Avatar user={account} size="small" />
              <div className="adminIdentity">
                <strong>{account.displayName}</strong>
                <span>@{account.username} · {account.role.toLowerCase().replace("_", " ")}</span>
              </div>
              <form action={resetUserPasswordAction} className="inlineForm">
                <input type="hidden" name="userId" value={account.id} />
                <label>
                  <span className="srOnly">Temporary password for {account.username}</span>
                  <input
                    name="temporaryPassword"
                    type="password"
                    minLength={12}
                    required
                    placeholder="New temporary password"
                  />
                </label>
                <button type="submit" className="button ghost small">Reset</button>
              </form>
              {account.id !== admin.id && (
                <form action={toggleUserDisabledAction}>
                  <input type="hidden" name="userId" value={account.id} />
                  <button
                    type="submit"
                    className={`button small ${account.disabledAt ? "secondary" : "ghost"}`}
                  >
                    {account.disabledAt ? "Enable" : "Disable"}
                  </button>
                </form>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <span className="eyebrow">ALL CLUBS</span>
            <h2>{allGroups.length} active and archived</h2>
          </div>
        </div>
        <div className="groupChips">
          {allGroups.map((group) => (
            <Link href={`/groups/${group.id}`} className="groupChip glass" key={group.id}>
              {group.emoji} {group.name}
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
