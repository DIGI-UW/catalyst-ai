import { expect, test } from "@playwright/test";
import { installBaselineApi } from "./support/baseline-fixture";

test("summary, keyboard evidence and options preserve the conversation and draft", async ({ page }, testInfo) => {
  const writes: string[] = [];
  page.on("request", request => {
    if (request.method() !== "GET" && request.url().includes("/v1/catalyst/")) writes.push(request.url());
  });
  await installBaselineApi(page);
  await page.goto("/");
  const draft = page.getByRole("textbox", { name: "Ask a follow-up" });
  await draft.fill("Keep the missing months visible");
  const turn = page.locator("#turn-1");
  const details = turn.getByRole("button", { name: "View query details" });
  const summary = details;
  await expect(turn.getByText("Returned fields:")).toBeVisible();
  await expect(turn).toContainText("month, n.");
  await expect(page.locator("#turn-2")).toContainText('column "test_type" does not exist');
  await expect(turn.getByRole("table")).toBeVisible();
  await expect(turn.locator("tbody tr")).toHaveCount(3);
  await expect(page.locator("#turn-2 table")).toHaveCount(0);
  await expect(details).toHaveAttribute("aria-expanded", "false");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("aria-expanded", "true");
  await expect(turn.locator(".query-turn__sql")).toContainText("analytics.lab_result_fact_v1");
  const recordedSQL = await turn.locator(".query-turn__sql pre").textContent();
  await page.keyboard.press("Escape");
  await expect(details).toHaveAttribute("aria-expanded", "false");
  await expect(summary).toBeFocused();
  await page.keyboard.press("Space");
  await expect(details).toHaveAttribute("aria-expanded", "true");
  await page.getByText("View options", { exact: true }).click();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await page.getByText("Advanced mode", { exact: true }).click();
  await expect(page.getByRole("switch", { name: "Advanced mode" })).toBeChecked();
  await page.keyboard.press("Escape");
  // A deliberate disclosure choice survives a global mode change.
  await expect(details).toHaveAttribute("aria-expanded", "true");
  await expect(turn.locator(".query-turn__sql pre")).toHaveText(recordedSQL!);
  await expect(page.locator("#turn-3 .query-turn__preview")).toBeVisible();
  await expect(draft).toHaveValue("Keep the missing months visible");
  await expect(page.getByRole("combobox", { name: "Model profile" })).toBeVisible();
  await page.locator(".query-settings > summary").focus();
  await page.keyboard.press("Escape");
  for (const width of [1280, 640, 390, 320]) {
    await page.setViewportSize({ width, height: 720 });
    expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
    await expect(draft).toHaveValue("Keep the missing months visible");
    await page.screenshot({ path: testInfo.outputPath(`conversation-dark-${width}.png`), fullPage: true });
  }
  // Merely browsing evidence and changing presentation cannot execute SQL or call a model.
  expect(writes.filter(url => /\/execute|\/turns|\/question/.test(url))).toEqual([]);
});
