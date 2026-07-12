import { expect, test } from "@playwright/test";

test("login experience is responsive and keyboard-accessible", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /Do the tiny thing/ })).toBeVisible();
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Let's go" })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);

  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});
