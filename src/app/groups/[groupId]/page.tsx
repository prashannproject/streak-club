import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import { AppShell, Avatar } from "@/components/app-shell";
import {
  CreateHabitForm,
  DeleteGroupForm,
  EditGroupForm,
  InviteForm,
} from "@/components/forms";
import { db } from "@/db";
import {
  checkIns,
  groupMemberships,
  groups,
  habits,
  users,
} from "@/db/schema";
import {
  archiveHabitAction,
  toggleCheckInAction,
  updateHabitAction,
} from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { canManageGroup } from "@/lib/policy";
import { averageConsistencyScore, currentStreak, dailyConsistencyScore } from "@/lib/scoring";

type PageProps = { params: Promise<{ groupId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { groupId } = await params;
  const [group] = await db
    .select({ name: groups.name })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  return { title: group?.name ?? "Group" };
}

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

function lastDates(today: string, amount: number) {
  const cursor = new Date(`${today}T12:00:00Z`);
  return Array.from({ length: amount }, (_, index) => {
    const date = new Date(cursor);
    date.setUTCDate(date.getUTCDate() - (amount - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

export default async function GroupPage({ params }: PageProps) {
  const user = await requireUser();
  const { groupId } = await params;
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group || group.archivedAt) notFound();

  const [membership] = await db
    .select({ role: groupMemberships.role })
    .from(groupMemberships)
    .where(
      and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, user.id)),
    )
    .limit(1);
  if (!membership && user.role !== "SUPER_ADMIN") notFound();
  const isManager = canManageGroup(membership?.role, user.role);
  const canDeleteGroup = membership?.role === "OWNER" || user.role === "SUPER_ADMIN";

  const activeHabits = await db
    .select()
    .from(habits)
    .where(and(eq(habits.groupId, groupId), isNull(habits.archivedAt)))
    .orderBy(asc(habits.createdAt));
  const members = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      username: users.username,
      emoji: users.emoji,
      avatarPath: users.avatarPath,
      leaderboardVisible: users.leaderboardVisible,
      role: groupMemberships.role,
    })
    .from(groupMemberships)
    .innerJoin(users, eq(groupMemberships.userId, users.id))
    .where(eq(groupMemberships.groupId, groupId))
    .orderBy(asc(groupMemberships.joinedAt));

  const today = todayIn(user.timezone);
  const dates = lastDates(today, 7);
  const recentCheckIns =
    activeHabits.length === 0
      ? []
      : await db
          .select({
            userId: checkIns.userId,
            habitId: checkIns.habitId,
            localDate: checkIns.localDate,
          })
          .from(checkIns)
          .where(
            and(
              inArray(
                checkIns.habitId,
                activeHabits.map((habit) => habit.id),
              ),
              gte(checkIns.localDate, dates[0]),
            ),
          );

  const myCompletedToday = new Set(
    recentCheckIns
      .filter((item) => item.userId === user.id && item.localDate === today)
      .map((item) => item.habitId),
  );

  const standings = members
    .filter((member) => member.leaderboardVisible)
    .map((member) => {
      const scores = dates.map((date) => {
        const completed = recentCheckIns.filter(
          (item) => item.userId === member.id && item.localDate === date,
        ).length;
        return dailyConsistencyScore(completed, activeHabits.length);
      });
      const completedDays = dates.filter((_, index) => scores[index] === 100);
      return {
        ...member,
        score: averageConsistencyScore(scores),
        streak: currentStreak(completedDays, today),
      };
    })
    .sort((left, right) => right.score - left.score || right.streak - left.streak);

  const myScore = dailyConsistencyScore(myCompletedToday.size, activeHabits.length);

  return (
    <AppShell user={user}>
      <section className="groupHero">
        <div className="groupTitle">
          <span className="groupEmoji giant">{group.emoji}</span>
          <div>
            <span className="eyebrow">{membership?.role ?? "SUPER ADMIN"} MODE</span>
            <h1>{group.name}</h1>
            <p className="lede">{group.description || "Built for gentle momentum."}</p>
          </div>
        </div>
        <div className="todayDial clay">
          <strong>{myScore}%</strong>
          <span>today</span>
        </div>
      </section>

      <div className="twoColumn">
        <section className="sectionBlock">
          <div className="sectionHeading">
            <div>
              <span className="eyebrow">TODAY&apos;S MOVES</span>
              <h2>Tap what happened</h2>
            </div>
            <span className="countPill">{myCompletedToday.size}/{activeHabits.length}</span>
          </div>
          {activeHabits.length === 0 ? (
            <div className="emptyState compact glass">
              <span className="emptyEmoji">🌱</span>
              <h3>No habits yet</h3>
              <p>A group admin can plant the first one below.</p>
            </div>
          ) : (
            <div className="habitList">
              {activeHabits.map((habit) => {
                const completed = myCompletedToday.has(habit.id);
                return (
                  <article className={`habitCard glass ${completed ? "isDone" : ""}`} key={habit.id}>
                    <span className="habitEmoji">{habit.emoji}</span>
                    <div>
                      <h3>{habit.name}</h3>
                      <p>{habit.description || "Showing up counts."}</p>
                    </div>
                    <form action={toggleCheckInAction}>
                      <input type="hidden" name="groupId" value={groupId} />
                      <input type="hidden" name="habitId" value={habit.id} />
                      <button
                        type="submit"
                        className={`checkButton ${completed ? "checked" : ""}`}
                        aria-label={completed ? `Undo ${habit.name}` : `Complete ${habit.name}`}
                        aria-pressed={completed}
                      >
                        {completed ? "✓" : "+"}
                      </button>
                    </form>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="leaderboard panel glass">
          <div className="sectionHeading">
            <div>
              <span className="eyebrow">7-DAY VIBE</span>
              <h2>Friendly standings</h2>
            </div>
          </div>
          <p className="fieldHint">
            Fair score: everyone gets the same daily maximum, no matter their habit count.
          </p>
          <ol className="standingList">
            {standings.map((member, index) => (
              <li key={member.id}>
                <span className="rank">{index + 1}</span>
                <Avatar user={member} size="small" />
                <div>
                  <strong>{member.displayName}</strong>
                  <small>{member.streak > 0 ? `${member.streak} day flow` : "fresh start"}</small>
                </div>
                <span className="score">{member.score}</span>
              </li>
            ))}
          </ol>
          {standings.length === 0 && (
            <p className="softNote">Everyone has hidden their standings. Respect.</p>
          )}
        </aside>
      </div>

      <section className="membersStrip sectionBlock">
        <div>
          <span className="eyebrow">THE CREW</span>
          <h2>{members.length}/4 spots filled</h2>
        </div>
        <div className="avatarStack">
          {members.map((member) => <Avatar user={member} key={member.id} />)}
        </div>
      </section>

      {isManager && (
        <section className="manageGrid sectionBlock">
          <div className="panel glass">
            <span className="eyebrow">GROW THE CREW</span>
            <h2>Invite a friend</h2>
            <p className="fieldHint">You need both details. That protects people from random invites.</p>
            <InviteForm groupId={groupId} />
          </div>
          <div className="panel glass">
            <span className="eyebrow">SET THE QUEST</span>
            <h2>Add a habit</h2>
            <CreateHabitForm groupId={groupId} />
            {activeHabits.length > 0 && (
              <details className="archiveArea">
                <summary>Edit or archive habits</summary>
                {activeHabits.map((habit) => (
                  <div className="habitEdit" key={habit.id}>
                    <form action={updateHabitAction}>
                      <input type="hidden" name="groupId" value={groupId} />
                      <input type="hidden" name="habitId" value={habit.id} />
                      <input name="emoji" defaultValue={habit.emoji} maxLength={16} required />
                      <input name="name" defaultValue={habit.name} maxLength={60} required />
                      <input
                        name="description"
                        defaultValue={habit.description}
                        maxLength={160}
                      />
                      <button type="submit" className="button ghost small">Save</button>
                    </form>
                    <form action={archiveHabitAction}>
                    <input type="hidden" name="groupId" value={groupId} />
                    <input type="hidden" name="habitId" value={habit.id} />
                    <button type="submit" className="textButton">Archive</button>
                    </form>
                  </div>
                ))}
              </details>
            )}
          </div>
          <div className="panel glass groupSettingsPanel">
            <span className="eyebrow">GROUP SETTINGS</span>
            <h2>Edit the club</h2>
            <EditGroupForm group={group} />
            {canDeleteGroup && (
              <div className="dangerZone">
                <h3>Delete this group</h3>
                <p>
                  Permanent means permanent. Every habit, check-in, membership, and pending
                  invitation in this group will be removed.
                </p>
                <DeleteGroupForm groupId={group.id} groupName={group.name} />
              </div>
            )}
          </div>
        </section>
      )}
    </AppShell>
  );
}
