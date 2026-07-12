import { describe, expect, it } from "vitest";
import { canManageGroup, FREE_LIMITS, limitFor } from "./policy";

describe("free-tier policy", () => {
  it("uses the planned MVP limits", () => {
    expect(FREE_LIMITS).toEqual({
      ownedGroups: 2,
      groupMembers: 4,
      activeHabits: 3,
    });
  });

  it("allows owners, admins, and super admins to manage groups", () => {
    expect(canManageGroup("OWNER", "USER")).toBe(true);
    expect(canManageGroup("ADMIN", "USER")).toBe(true);
    expect(canManageGroup("MEMBER", "USER")).toBe(false);
    expect(canManageGroup(undefined, "SUPER_ADMIN")).toBe(true);
    expect(limitFor("groupMembers", "SUPER_ADMIN")).toBe(Number.POSITIVE_INFINITY);
  });
});
