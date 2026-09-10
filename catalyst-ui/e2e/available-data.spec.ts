import { expect, test } from "@playwright/test";
import { installBaselineApi } from "./support/baseline-fixture";

test("browse and draft together without retrieving rows or executing SQL", async ({ page }, testInfo) => {
  await installBaselineApi(page, { empty: true });
  const dataRequests: string[] = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (/\/dataset(?:\/rows)?$/.test(path) || (request.method() === "POST" && path.endsWith("/execute"))) dataRequests.push(path);
  });
  await page.goto("/");
  const draft = page.getByRole("textbox", { name: "Your question" });
  await draft.fill("Monthly tests\nKeep missing dates");
  const opener = page.getByRole("button", { name: "What data is available?" });
  await opener.click();
  const browser = page.getByRole("complementary", { name: "Available data" });
  const search = browser.getByRole("searchbox", { name: "Search tables and fields" });
  await expect(search).toBeFocused();
  await search.fill("patient_id");
  await expect(browser.getByText("patient_id", { exact: true })).toBeVisible();
  await browser.getByRole("button", { name: "Back to your question" }).click();
  await expect(draft).toBeFocused();
  await draft.press("Escape");
  await expect(browser).toBeVisible();
  const panelBox = (await browser.boundingBox())!;
  const draftBox = (await draft.boundingBox())!;
  expect(draftBox.x + draftBox.width).toBeLessThanOrEqual(panelBox.x);
  await page.screenshot({ path: testInfo.outputPath("available-data-desktop.png") });

  await search.focus();
  await search.press("Escape");
  await expect(browser).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(search).toHaveValue("patient_id");
  await expect(draft).toHaveValue("Monthly tests\nKeep missing dates");
  await expect(browser.getByText("patient_id", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 720 });
  await browser.getByText("result_unit", { exact: true }).scrollIntoViewIfNeeded();
  const browseScroll = await browser.evaluate(element => element.scrollTop);
  expect(browseScroll).toBeGreaterThan(0);
  await browser.getByRole("button", { name: "Back to your question" }).click();
  await expect(draft).toBeFocused();
  expect(await browser.evaluate(element => element.scrollTop)).toBe(browseScroll);
  const narrowPanel = (await browser.boundingBox())!;
  const narrowDraft = (await draft.boundingBox())!;
  expect(narrowDraft.y).toBeGreaterThanOrEqual(narrowPanel.y + narrowPanel.height);
  expect(await page.evaluate<boolean>("document.documentElement.scrollWidth > window.innerWidth")).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("available-data-narrow.png") });
  expect(dataRequests).toEqual([]);
});
