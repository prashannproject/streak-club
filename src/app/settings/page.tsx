import type { Metadata } from "next";
import { AppShell, Avatar } from "@/components/app-shell";
import {
  AvatarUploadForm,
  ProfileForm,
  RotateInviteCodeForm,
} from "@/components/forms";
import {
  clearOptionalProfileDataAction,
  deleteAvatarAction,
  logoutAllDevicesAction,
} from "@/lib/actions";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "My vibe" };

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <AppShell user={user}>
      <section className="settingsHero">
        <Avatar user={user} size="large" />
        <div>
          <span className="eyebrow">MY VIBE</span>
          <h1>{user.displayName}</h1>
          <p className="lede">@{user.username} · code ends in {user.inviteCodeHint}</p>
        </div>
      </section>

      <div className="settingsGrid">
        <section className="panel glass">
          <span className="eyebrow">PROFILE</span>
          <h2>The basics, your way</h2>
          <ProfileForm profile={user} />
        </section>

        <div className="stack">
          <section className="panel glass">
            <span className="eyebrow">PROFILE PICTURE</span>
            <h2>Face card or emoji</h2>
            <AvatarUploadForm />
            {user.avatarPath && (
              <form action={deleteAvatarAction}>
                <button type="submit" className="textButton dangerText">Remove photo</button>
              </form>
            )}
          </section>

          <section className="panel glass">
            <span className="eyebrow">PRIVATE INVITE CODE</span>
            <h2>Code ending in {user.inviteCodeHint}</h2>
            <p className="fieldHint">
              We cannot display the current code because it is not stored readably. Rotate it to
              reveal a new one; old invites using the previous code will stop working.
            </p>
            <RotateInviteCodeForm />
          </section>

          <section className="panel glass">
            <span className="eyebrow">SECURITY</span>
            <h2>Session controls</h2>
            <form action={logoutAllDevicesAction}>
              <button type="submit" className="button secondary">Log out every device</button>
            </form>
            <form action={clearOptionalProfileDataAction}>
              <button type="submit" className="textButton dangerText">
                Clear my optional profile data
              </button>
            </form>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
