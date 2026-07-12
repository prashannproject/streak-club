import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { AppShell, Avatar } from "@/components/app-shell";
import { db } from "@/db";
import {
  checkIns,
  groupMemberships,
  groups,
  habits,
  invitations,
  users,
} from "@/db/schema";
import { respondInvitationAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { dailyConsistencyScore } from "@/lib/scoring";

export const metadata: Metadata = { title: "Today" };

function todayIn(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const today = todayIn(user.timezone);
  const memberships = await db
    .select({
      groupId: groups.id,
      name: groups.name,
      description: groups.description,
      emoji: groups.emoji,
      role: groupMemberships.role,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
    .where(and(eq(groupMemberships.userId, user.id), isNull(groups.archivedAt)))
    .orderBy(desc(groups.createdAt));

  const groupCards = await Promise.all(
    memberships.map(async (group) => {
      const [habitCount] = await db
        .select({ value: count() })
        .from(habits)
        .where(and(eq(habits.groupId, group.groupId), isNull(habits.archivedAt)));
      const [doneCount] = await db
        .select({ value: count() })
        .from(checkIns)
        .innerJoin(habits, eq(checkIns.habitId, habits.id))
        .where(
          and(
            eq(habits.groupId, group.groupId),
            eq(checkIns.userId, user.id),
            eq(checkIns.localDate, today),
            isNull(habits.archivedAt),
          ),
        );
      return {
        ...group,
        habitCount: habitCount.value,
        doneCount: doneCount.value,
        score: dailyConsistencyScore(doneCount.value, habitCount.value),
      };
    }),
  );

  const pendingInvites = await db
    .select({
      id: invitations.id,
      groupName: groups.name,
      groupEmoji: groups.emoji,
      inviterName: users.displayName,
      inviterEmoji: users.emoji,
      inviterAvatar: users.avatarPath,
    })
    .from(invitations)
    .innerJoin(groups, eq(invitations.groupId, groups.id))
    .innerJoin(users, eq(invitations.inviterId, users.id))
    .where(
      and(eq(invitations.recipientId, user.id), eq(invitations.status, "PENDING")),
    )
    .orderBy(desc(invitations.createdAt));

  const average =
    groupCards.length === 0
      ? 0
      : Math.round(groupCards.reduce((sum, group) => sum + group.score, 0) / groupCards.length);

  return (
    <AppShell user={user}>
      <section className="heroRow">
        <div>
          <span className="eyebrow">YOUR DAILY PULSE</span>
          <h1>Hey {user.displayName},<br />what&apos;s the move?</h1>
          <p className="lede">Progress over perfection. One tap is still a win.</p>
        </div>
        <div className="scoreBlob clay">
          <span>{average}</span>
          <small>today&apos;s energy</small>
        </div>
      </section>

      {pendingInvites.length > 0 && (
        <section className="sectionBlock">
          <div className="sectionHeading">
            <div>
              <span className="eyebrow">INCOMING</span>
              <h2>Your friends want you in</h2>
            </div>
          </div>
          <div className="inviteRail">
            {pendingInvites.map((invite) => (
              <article className="inviteCard glass" key={invite.id}>
                <Avatar
                  user={{
                    displayName: invite.inviterName,
                    emoji: invite.inviterEmoji,
                    avatarPath: invite.inviterAvatar,
                  }}
                />
                <div>
                  <strong>{invite.groupEmoji} {invite.groupName}</strong>
                  <p>{invite.inviterName} sent the invite. Your call.</p>
                </div>
                <div className="buttonRow">
                  <form action={respondInvitationAction}>
                    <input type="hidden" name="invitationId" value={invite.id} />
                    <input type="hidden" name="response" value="ACCEPTED" />
                    <button className="button primary small" type="submit">I&apos;m in</button>
                  </form>
                  <form action={respondInvitationAction}>
                    <input type="hidden" name="invitationId" value={invite.id} />
                    <input type="hidden" name="response" value="DECLINED" />
                    <button className="button ghost small" type="submit">Not now</button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <span className="eyebrow">YOUR CLUBS</span>
            <h2>Small steps, loud support</h2>
          </div>
          <Link href="/groups/new" className="button secondary">+ New group</Link>
        </div>

        {groupCards.length === 0 ? (
          <div className="emptyState glass">
            <span className="emptyEmoji">🛸</span>
            <h3>No club yet. That&apos;s suspicious.</h3>
            <p>Start one, add up to three habits, and bring three friends.</p>
            <Link href="/groups/new" className="button primary">Create your first group</Link>
          </div>
        ) : (
          <div className="groupGrid">
            {groupCards.map((group, index) => (
              <Link
                href={`/groups/${group.groupId}`}
                className={`groupCard clay cardTone${(index % 3) + 1}`}
                key={group.groupId}
              >
                <div className="cardTop">
                  <span className="groupEmoji">{group.emoji}</span>
                  <span className="rolePill">{group.role.toLowerCase()}</span>
                </div>
                <h3>{group.name}</h3>
                <p>{group.description || "A little consistency laboratory."}</p>
                <div className="progressTrack" aria-label={`${group.score}% complete today`}>
                  <span style={{ width: `${group.score}%` }} />
                </div>
                <div className="cardStats">
                  <strong>{group.doneCount}/{group.habitCount}</strong>
                  <span>{group.score}% today</span>
                  <span aria-hidden="true">↗</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <aside className="kindBanner">
        <span>💿</span>
        <p><strong>Reminder:</strong> a reset is data, not drama. Your worth is not a number.</p>
      </aside>
    </AppShell>
  );
}
