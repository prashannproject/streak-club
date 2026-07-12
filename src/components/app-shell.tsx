import Link from "next/link";
import { logoutAction } from "@/lib/actions";
import type { SafeUser } from "@/lib/auth";

export function Avatar({
  user,
  size = "medium",
}: {
  user: Pick<SafeUser, "displayName" | "emoji" | "avatarPath">;
  size?: "small" | "medium" | "large";
}) {
  return (
    <span className={`avatar avatar-${size}`} aria-label={`${user.displayName}'s avatar`}>
      {user.avatarPath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/avatar/${encodeURIComponent(user.avatarPath)}`} alt="" />
      ) : (
        user.emoji
      )}
    </span>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: SafeUser;
  children: React.ReactNode;
}) {
  return (
    <div className="appFrame">
      <header className="topbar glass">
        <Link href="/dashboard" className="brand" aria-label="Streak Club dashboard">
          <span className="brandMark">S</span>
          <span>streak club</span>
        </Link>
        <nav className="desktopNav" aria-label="Main navigation">
          <Link href="/dashboard">Home</Link>
          <Link href="/groups/new">New group</Link>
          <Link href="/settings">My vibe</Link>
          {user.role === "SUPER_ADMIN" && <Link href="/admin">Admin</Link>}
        </nav>
        <div className="profileMini">
          <span className="profileWords">
            <strong>{user.displayName}</strong>
            <small>@{user.username}</small>
          </span>
          <Avatar user={user} size="small" />
        </div>
      </header>
      <main className="pageWrap">{children}</main>
      <nav className="bottomNav glass" aria-label="Mobile navigation">
        <Link href="/dashboard">
          <span>⌂</span>Home
        </Link>
        <Link href="/groups/new">
          <span>＋</span>Create
        </Link>
        <Link href="/settings">
          <span>☺</span>Me
        </Link>
        {user.role === "SUPER_ADMIN" && (
          <Link href="/admin">
            <span>⚡</span>Admin
          </Link>
        )}
      </nav>
      <form action={logoutAction} className="logoutFloat">
        <button type="submit" className="textButton">
          Log out
        </button>
      </form>
    </div>
  );
}
