import { expect, test } from "@playwright/test";
import { installBaselineApi } from "./support/baseline-fixture";

test("one result table with disclosed provenance and preserved draft and focus", async ({ page }, testInfo) => {
  await installBaselineApi(page);
  await page.goto("/");
  const draft = page.getByRole("textbox", { name: "Ask a follow-up" });
  await draft.fill("Keep the missing months visible");
  const trigger = page.getByRole("button", { name: "Review results" }).last();
  await expect(page.locator(".query-turn table")).toHaveCount(0);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Review panel" });
  const details = dialog.locator("details").filter({ has: page.getByText("Technical details", { exact: true }) });
  await expect(page.getByRole("table")).toHaveCount(1);
  await expect(dialog.getByRole("columnheader", { name: "n bigint" })).toBeVisible();
  await expect(dialog.getByText(/Limits: up to 1,000 rows and 30 seconds/)).toBeVisible();
  await expect(details).not.toHaveAttribute("open");
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  await expect(close.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(close.last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close.first()).toBeFocused();
  await dialog.getByText("Technical details", { exact: true }).click();
  await expect(dialog.getByText("cat-trace-3", { exact: true })).toBeVisible();
  await dialog.getByText("Technical details", { exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("review-light.png") });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(draft).toHaveValue("Keep the missing months visible");

  await page.getByText(/View options/).click();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await page.keyboard.press("Escape");
  await trigger.click();
  await expect(details).not.toHaveAttribute("open");
  await page.screenshot({ path: testInfo.outputPath("review-dark.png") });
  for (const width of [640, 390, 320]) {
    await page.setViewportSize({ width, height: 720 });
    await expect(close.first()).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Save query" })).toBeInViewport();
    const warning = dialog.locator(".cds--inline-notification").filter({ hasText: "Earlier result" });
    const warningBox = (await warning.boundingBox())!;
    const subtitleBox = (await warning.locator(".cds--inline-notification__subtitle").boundingBox())!;
    expect(subtitleBox.y + subtitleBox.height).toBeLessThanOrEqual(warningBox.y + warningBox.height);
    expect(await page.evaluate<boolean>("document.documentElement.scrollWidth > window.innerWidth")).toBe(false);
  }
  await page.screenshot({ path: testInfo.outputPath("review-narrow.png") });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(draft).toHaveValue("Keep the missing months visible");
});
