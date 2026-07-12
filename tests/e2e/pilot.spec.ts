import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

const adminTemporaryPassword = process.env.E2E_ADMIN_TEMP_PASSWORD;
const adminFinalPassword = process.env.E2E_ADMIN_FINAL_PASSWORD;
const adminUsername = process.env.E2E_ADMIN_USERNAME;

if (!adminTemporaryPassword || !adminFinalPassword || !adminUsername) {
  throw new Error(
    "E2E_ADMIN_USERNAME, E2E_ADMIN_TEMP_PASSWORD and E2E_ADMIN_FINAL_PASSWORD are required.",
  );
}

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Let's go" }).click();
}

async function changePassword(page: Page, current: string, next: string) {
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByLabel("Temporary password").fill(current);
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Repeat new password").fill(next);
  await page.getByRole("button", { name: "Lock it in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function addHabit(
  page: Page,
  name: string,
  emoji: string,
  description = "E2E habit description",
  expectCreated = true,
) {
  const panel = page.locator(".panel").filter({ hasText: "Add a habit" });
  await panel.getByLabel("Habit").fill(name);
  await panel.getByLabel("Emoji").fill(emoji);
  await panel.getByLabel("Tiny reminder").fill(description);
  const submit = panel.getByRole("button", { name: "Add habit" });
  await submit.click();
  if (expectCreated) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(submit).toBeEnabled();
  }
}

test("complete pilot journey and security controls", async ({ page, request }) => {
  const suffix = Date.now().toString().slice(-8);
  const memberUsername = `e2e.${suffix}`;
  const memberTemporaryPassword = `TempMember${suffix}!`;
  const memberFinalPassword = `FinalMember${suffix}!`;
  const adminGroup = `E2E Crew ${suffix}`;

  await test.step("security headers and protected-route redirect", async () => {
    const loginResponse = await request.get("/login");
    expect(loginResponse.ok()).toBeTruthy();
    const csp = loginResponse.headers()["content-security-policy"];
    expect(csp).toContain("nonce-");
    expect(csp).toContain("frame-ancestors 'none'");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  await test.step("admin login and forced password replacement", async () => {
    await login(page, adminUsername, adminTemporaryPassword);
    await changePassword(page, adminTemporaryPassword, adminFinalPassword);
    await expect(page.getByText("Hey E2E Admin")).toBeVisible();
  });

  let inviteCode = "";
  await test.step("username suggestions and account provisioning", async () => {
    await page.getByRole("link", { name: "Admin" }).first().click();
    await expect(page).toHaveURL(/\/admin$/);
    const username = page.getByLabel("Username");
    await username.fill(adminUsername);
    await expect(page.locator("#username-status")).toContainText("Taken");
    await username.fill(memberUsername);
    await expect(page.locator("#username-status")).toContainText("Available");
    await page.getByLabel("Display name").fill("E2E Member");
    await page.getByLabel("Temporary password", { exact: true }).fill(memberTemporaryPassword);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(`Account @${memberUsername} created`)).toBeVisible();
    inviteCode = (await page.locator(".secretCode").textContent())?.trim() ?? "";
    expect(inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  await test.step("admin creates group, habit, and protected invitation", async () => {
    await page.getByRole("link", { name: "New group" }).first().click();
    await page.getByLabel("Group name").fill(adminGroup);
    await page.getByLabel("Group emoji").fill("🧪");
    await page.getByLabel("What's the energy?").fill("Browser-tested momentum.");
    await page.getByRole("button", { name: "Create the group" }).click();
    await expect(page.getByRole("heading", { name: adminGroup })).toBeVisible();
    await addHabit(page, "Browser walk", "🚶");
    await expect(page.getByText("Habit added.")).toBeVisible();

    const invitePanel = page.locator(".panel").filter({ hasText: "Invite a friend" });
    await invitePanel.getByLabel("Exact username").fill(memberUsername);
    await invitePanel.getByLabel("Their invite code").fill(inviteCode);
    await invitePanel.getByRole("button", { name: "Send invite" }).click();
    await expect(page.getByText("Invite sent. They get the final say.")).toBeVisible();
  });

  await test.step("member changes password and accepts invitation", async () => {
    await page.getByRole("button", { name: "Log out" }).click();
    await login(page, memberUsername, memberTemporaryPassword);
    await changePassword(page, memberTemporaryPassword, memberFinalPassword);
    const invitation = page.locator(".inviteCard").filter({ hasText: adminGroup });
    await expect(invitation).toBeVisible();
    await invitation.getByRole("button", { name: "I'm in" }).click();
    await expect(invitation).toBeHidden();
    await page.getByRole("link", { name: new RegExp(adminGroup) }).click();
  });

  await test.step("member completes and undoes a daily check-in", async () => {
    const complete = page.getByRole("button", { name: "Complete Browser walk" });
    await complete.click();
    await expect(page.locator(".todayDial")).toContainText("100%");
    const undo = page.getByRole("button", { name: "Undo Browser walk" });
    await undo.click();
    await expect(page.locator(".todayDial")).toContainText("0%");
    await page.getByRole("button", { name: "Complete Browser walk" }).click();
  });

  await test.step("normal-user habit limits are enforced", async () => {
    await page.getByRole("link", { name: "New group" }).first().click();
    await page.getByLabel("Group name").fill(`Owned One ${suffix}`);
    await page.getByLabel("Group emoji").fill("🌱");
    await page.getByRole("button", { name: "Create the group" }).click();
    await addHabit(page, "Habit one", "1️⃣");
    await addHabit(page, "Habit two", "2️⃣");
    await addHabit(page, "Habit three", "3️⃣");
    await addHabit(page, "Habit four", "4️⃣", "E2E habit description", false);
    await expect(page.getByText("Free groups can have up to 3 active habits.")).toBeVisible();
  });

  await test.step("owner edits and permanently deletes a group", async () => {
    await page.getByRole("link", { name: "Home" }).first().click();
    await page
      .getByRole("link", { name: new RegExp(`Owned One ${suffix}`) })
      .click();
    const editedName = `Owned One Edited ${suffix}`;
    const settings = page.locator(".groupSettingsPanel");
    await settings.getByLabel("Group name").fill(editedName);
    await settings.getByLabel("Group emoji").fill("✏️");
    await settings.getByLabel("Group description").fill("Edited through the browser.");
    await settings.getByRole("button", { name: "Save group changes" }).click();
    await expect(page.getByText("Group updated.")).toBeVisible();
    await expect(page.getByRole("heading", { name: editedName, exact: true })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await settings.getByRole("button", { name: "Delete group permanently" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(editedName)).toBeHidden();
  });

  await test.step("profile privacy and native avatar processing work", async () => {
    await page.getByRole("link", { name: "My vibe" }).first().click();
    await page.getByLabel("Tiny bio").fill("Tested in a real browser.");
    await page.getByLabel("Show my profile to group members").uncheck();
    await page.getByRole("button", { name: "Save my vibe" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();

    const png = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 4,
        background: { r: 124, g: 60, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    await page.getByLabel("Profile picture").setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: png,
    });
    await page.getByRole("button", { name: "Upload photo" }).click();
    await expect(page.getByText("Profile picture updated.")).toBeVisible();
    await page.getByRole("button", { name: "Remove photo" }).click();
    await expect(page.getByRole("button", { name: "Remove photo" })).toBeHidden();
  });

  await test.step("session invalidation returns the user to login", async () => {
    await page.getByRole("button", { name: "Log out every device" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login$/);
  });
});
