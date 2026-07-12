export const FREE_LIMITS = {
  ownedGroups: 2,
  groupMembers: 4,
  activeHabits: 3,
} as const;

export type GlobalRole = "USER" | "SUPER_ADMIN";
export type MembershipRole = "OWNER" | "ADMIN" | "MEMBER";

export function canManageGroup(role: MembershipRole | undefined, globalRole: GlobalRole) {
  return globalRole === "SUPER_ADMIN" || role === "OWNER" || role === "ADMIN";
}

export function limitFor(
  kind: keyof typeof FREE_LIMITS,
  globalRole: GlobalRole,
): number {
  return globalRole === "SUPER_ADMIN"
    ? Number.POSITIVE_INFINITY
    : FREE_LIMITS[kind];
}
