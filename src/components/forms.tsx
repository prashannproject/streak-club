"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  changePasswordAction,
  createGroupAction,
  createHabitAction,
  createUserAction,
  deleteGroupAction,
  loginAction,
  rotateInviteCodeAction,
  sendInvitationAction,
  updateGroupAction,
  updateProfileAction,
  uploadAvatarAction,
  type ActionState,
} from "@/lib/actions";
import { UsernameInput } from "./username-input";

const initialState: ActionState = {};

function SubmitButton({
  children,
  className = "button primary",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? "Working…" : children}
    </button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (!state.error && !state.message && !state.inviteCode) return null;
  return (
    <div
      className={`feedback ${state.error ? "feedbackError" : "feedbackSuccess"}`}
      role={state.error ? "alert" : "status"}
    >
      {state.error ?? state.message}
      {state.inviteCode && (
        <strong className="secretCode" aria-label="New invite code">
          {state.inviteCode}
        </strong>
      )}
    </div>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(loginAction, initialState);
  return (
    <form action={action} className="stack">
      <label>
        Username
        <input name="username" autoComplete="username" required maxLength={24} />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
      </label>
      <Feedback state={state} />
      <SubmitButton>Let&apos;s go</SubmitButton>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initialState);
  return (
    <form action={action} className="stack">
      <label>
        Temporary password
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <label>
        New password
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
      </label>
      <label>
        Repeat new password
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
      </label>
      <p className="fieldHint">12+ characters with uppercase, lowercase, and a number.</p>
      <Feedback state={state} />
      <SubmitButton>Lock it in</SubmitButton>
    </form>
  );
}

export function CreateUserForm() {
  const [state, action] = useActionState(createUserAction, initialState);
  return (
    <form action={action} className="stack">
      <div className="formGrid">
        <UsernameInput />
        <label>
          Display name
          <input name="displayName" required maxLength={60} />
        </label>
      </div>
      <label>
        Temporary password
        <input name="temporaryPassword" type="password" required minLength={12} />
      </label>
      <label>
        Role
        <select name="role" defaultValue="USER">
          <option value="USER">Member</option>
          <option value="SUPER_ADMIN">Super admin</option>
        </select>
      </label>
      <Feedback state={state} />
      <SubmitButton>Create account</SubmitButton>
    </form>
  );
}

type ProfileDefaults = {
  username: string;
  displayName: string;
  bio: string;
  pronouns: string | null;
  timezone: string;
  emoji: string;
  profileVisible: boolean;
  leaderboardVisible: boolean;
};

export function ProfileForm({ profile }: { profile: ProfileDefaults }) {
  const [state, action] = useActionState(updateProfileAction, initialState);
  return (
    <form action={action} className="stack">
      <div className="formGrid">
        <label>
          Username
          <input
            name="username"
            defaultValue={profile.username}
            required
            minLength={3}
            maxLength={24}
          />
        </label>
        <label>
          Display name
          <input name="displayName" defaultValue={profile.displayName} required maxLength={60} />
        </label>
      </div>
      <div className="formGrid">
        <label>
          Your emoji
          <input name="emoji" defaultValue={profile.emoji} required maxLength={16} />
        </label>
      </div>
      <label>
        Tiny bio
        <textarea name="bio" defaultValue={profile.bio} maxLength={160} rows={3} />
      </label>
      <div className="formGrid">
        <label>
          Pronouns <span className="fieldHint">(optional)</span>
          <input name="pronouns" defaultValue={profile.pronouns ?? ""} maxLength={30} />
        </label>
        <label>
          Timezone
          <input name="timezone" defaultValue={profile.timezone} required maxLength={64} />
        </label>
      </div>
      <label className="checkLabel">
        <input
          name="profileVisible"
          type="checkbox"
          defaultChecked={profile.profileVisible}
        />
        Show my profile to group members
      </label>
      <label className="checkLabel">
        <input
          name="leaderboardVisible"
          type="checkbox"
          defaultChecked={profile.leaderboardVisible}
        />
        Include me in friendly standings
      </label>
      <Feedback state={state} />
      <SubmitButton>Save my vibe</SubmitButton>
    </form>
  );
}

export function AvatarUploadForm() {
  const [state, action] = useActionState(uploadAvatarAction, initialState);
  return (
    <form action={action} className="stack">
      <label>
        Profile picture
        <input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required />
      </label>
      <p className="fieldHint">JPEG, PNG, or WebP. 5 MB max. We crop it square.</p>
      <Feedback state={state} />
      <SubmitButton className="button secondary">Upload photo</SubmitButton>
    </form>
  );
}

export function RotateInviteCodeForm() {
  const [state, action] = useActionState(rotateInviteCodeAction, initialState);
  return (
    <form action={action} className="stack compact">
      <Feedback state={state} />
      <SubmitButton className="button secondary">Create a new code</SubmitButton>
    </form>
  );
}

export function CreateGroupForm() {
  const [state, action] = useActionState(createGroupAction, initialState);
  return (
    <form action={action} className="stack">
      <div className="formGrid">
        <label>
          Group name
          <input name="name" required maxLength={60} placeholder="6AM delusion club" />
        </label>
        <label>
          Group emoji
          <input name="emoji" required maxLength={16} defaultValue="🔥" />
        </label>
      </div>
      <label>
        What&apos;s the energy?
        <textarea name="description" maxLength={240} rows={3} />
      </label>
      <Feedback state={state} />
      <SubmitButton>Create the group</SubmitButton>
    </form>
  );
}

type GroupDefaults = {
  id: string;
  name: string;
  description: string;
  emoji: string;
};

export function EditGroupForm({ group }: { group: GroupDefaults }) {
  const [state, action] = useActionState(updateGroupAction, initialState);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="groupId" value={group.id} />
      <div className="formGrid">
        <label>
          Group name
          <input name="name" defaultValue={group.name} required maxLength={60} />
        </label>
        <label>
          Group emoji
          <input name="emoji" defaultValue={group.emoji} required maxLength={16} />
        </label>
      </div>
      <label>
        Group description
        <textarea name="description" defaultValue={group.description} maxLength={240} rows={3} />
      </label>
      <Feedback state={state} />
      <SubmitButton className="button secondary">Save group changes</SubmitButton>
    </form>
  );
}

export function DeleteGroupForm({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName: string;
}) {
  return (
    <form
      action={deleteGroupAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Delete “${groupName}”? Habits, check-ins, memberships, and invitations will be permanently removed.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="groupId" value={groupId} />
      <SubmitButton className="button danger">Delete group permanently</SubmitButton>
    </form>
  );
}

export function CreateHabitForm({ groupId }: { groupId: string }) {
  const [state, action] = useActionState(createHabitAction, initialState);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="groupId" value={groupId} />
      <div className="formGrid">
        <label>
          Habit
          <input name="name" required maxLength={60} placeholder="Touch grass" />
        </label>
        <label>
          Emoji
          <input name="emoji" required maxLength={16} defaultValue="✅" />
        </label>
      </div>
      <label>
        Tiny reminder
        <input name="description" maxLength={160} placeholder="Ten minutes counts." />
      </label>
      <Feedback state={state} />
      <SubmitButton>Add habit</SubmitButton>
    </form>
  );
}

export function InviteForm({ groupId }: { groupId: string }) {
  const [state, action] = useActionState(sendInvitationAction, initialState);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="groupId" value={groupId} />
      <div className="formGrid">
        <label>
          Exact username
          <input name="username" required maxLength={24} placeholder="bestie.exe" />
        </label>
        <label>
          Their invite code
          <input
            name="inviteCode"
            required
            maxLength={16}
            autoComplete="off"
            className="codeInput"
          />
        </label>
      </div>
      <Feedback state={state} />
      <SubmitButton>Send invite</SubmitButton>
    </form>
  );
}
