import { expect, test } from "@playwright/test";
import { installBaselineApi } from "./support/baseline-fixture";

test("the composer stays available while reading and preserves an expanded draft", async ({
  page,
}, testInfo) => {
  await installBaselineApi(page);
  await page.setViewportSize({ width: 1280, height: 620 });
  await page.goto("/");
  await expect(page.locator(".query-turn__dataset").first()).toBeVisible();

  const input = page.getByRole("textbox", { name: "Ask a follow-up" });
  await expect(input).toBeVisible();
  await page.evaluate("window.scrollTo({ top: 0 })");
  await expect(input).toBeVisible();
  await page.evaluate(
    "window.scrollTo({ top: document.documentElement.scrollHeight })",
  );
  await expect(input).toBeVisible();

  expect((await page.locator("[data-query-composer-dock]").boundingBox())!.height)
    .toBeLessThanOrEqual(192);
  await expect(input).toHaveAccessibleDescription("Following question 3");

  const draft = "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight";
  await input.fill(draft);
  await page.evaluate(
    "document.getElementById('catalyst-followup').setSelectionRange(4, 7)",
  );
  const originalHeight = (await input.boundingBox())!.height;
  await page.getByRole("button", { name: "Expand" }).click();
  await expect.poll(async () => (await input.boundingBox())!.height)
    .toBeGreaterThan(originalHeight + 50);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(draft);
  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();

  const selection = await page.evaluate<number[]>(
    "(() => { const element = document.getElementById('catalyst-followup'); return [element.selectionStart, element.selectionEnd]; })()",
  );
  expect(selection).toEqual([4, 7]);
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(input).toBeFocused();
  await expect.poll(async () => (await input.boundingBox())!.height)
    .toBeCloseTo(originalHeight, 0);

  for (const theme of ["Dark", "Light"]) {
    await page.getByText(/View options/).click();
    await page.getByRole("radio", { name: theme, exact: true }).check();
    await page.keyboard.press("Escape");
    await expect(input).toHaveValue(draft);
    await expect(page.getByRole("button", { name: "Continue" })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`followup-${theme.toLowerCase()}.png`) });
  }
});

test("the first question grows and restores its actual writing area", async ({ page }) => {
  await installBaselineApi(page, { empty: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "Your question" });
  await input.fill("Keep this question while changing the writing area.");
  expect((await page.locator("[data-query-composer-dock]").boundingBox())!.height)
    .toBeLessThanOrEqual(210);
  const originalHeight = (await input.boundingBox())!.height;
  await page.getByRole("button", { name: "Expand", exact: true }).click();
  await expect.poll(async () => (await input.boundingBox())!.height)
    .toBeGreaterThan(originalHeight + 50);
  await expect(input).toBeFocused();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect.poll(async () => (await input.boundingBox())!.height)
    .toBeCloseTo(originalHeight, 0);
  await expect(input).toHaveValue("Keep this question while changing the writing area.");
  await expect(input).toBeFocused();
});

test("the composer and its actions remain reachable on a narrow screen", async ({
  page,
}, testInfo) => {
  await installBaselineApi(page);
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/");

  await expect(page.getByRole("textbox", { name: "Ask a follow-up" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Expand" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  expect((await page.locator("[data-query-composer-dock]").boundingBox())!.height)
    .toBeLessThanOrEqual(210);
  await page.getByText(/View options/).click();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Continue" })).toBeInViewport();
  expect(await page.evaluate<boolean>("document.documentElement.scrollWidth > window.innerWidth")).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("followup-narrow-dark.png") });
});
