import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("renders the persisted workflow and passes automated accessibility", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "IMPACT CONFIRMED" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Run history" }),
  ).toBeVisible();
  await expect(page.getByText("Human remains in control")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("supports keyboard diagnostics and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to run detail" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Open diagnostics" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Local diagnostics");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
