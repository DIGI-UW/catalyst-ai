import { test, expect } from "@playwright/test";

for (const theme of ["light", "dark"] as const) test(`imports a reviewed CSV through the real Gateway and reopens its immutable Dataset (${theme})`, async ({ page }, testInfo) => {
  test.skip(process.env.CATALYST_CSV_BROWSER !== "1", "Requires a configured disposable import database and real Gateway");
  const writes: string[] = [];
  const datasetTitle = `CSV browser review ${theme} ${Date.now()}`;
  page.on("request", request => { if (request.method() === "POST") writes.push(request.url()); });
  await page.emulateMedia({ colorScheme: theme });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Your question", exact: true }).fill("Keep this question while I import a file");
  await page.getByRole("button", { name: "Saved work", exact: true }).click();
  await page.getByRole("button", { name: "Upload CSV", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "browser-review.csv", mimeType: "text/csv",
    buffer: Buffer.from('Accession,Result,Collected,Notes\r\n001,<20,2026-05-06,"first, quoted"\r\n001,450,2026-05-06,\r\n002,900,2026-05-06,\r\n'),
  });
  await expect(page.getByLabel("Dataset name")).toBeVisible();
  await page.getByLabel("Dataset name").fill(datasetTitle);
  await page.getByLabel("2. Result").selectOption("number");
  await expect(page.getByText(/Result, result row 1: this value is not a valid number/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm import and save Dataset" })).toBeDisabled();
  await expect(page.getByRole("cell", { name: "<20", exact: true })).toBeVisible();
  await page.getByLabel("2. Result").selectOption("text");
  await expect(page.getByRole("button", { name: "Confirm import and save Dataset" })).toBeEnabled();
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Your question", exact: true })).toHaveValue("Keep this question while I import a file");
  await page.getByRole("button", { name: "Saved work", exact: true }).click();
  await expect(page.getByLabel("2. Result")).toHaveValue("text");
  await page.screenshot({ path: testInfo.outputPath("import-review-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Confirm import and save Dataset" }).click();
  const dialog = page.getByRole("dialog", { name: "Review panel" });
  await expect(dialog.getByRole("table", { name: "Imported Dataset rows" })).toBeVisible();
  await expect(dialog.getByRole("cell", { name: "001", exact: true })).toHaveCount(2);
  await expect(dialog.getByText("Saved SQL and values")).toHaveCount(0);
  await expect(dialog.getByText(/Execution evidence is unavailable/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("saved-import-desktop.png"), fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await dialog.boundingBox())?.y).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("saved-import-narrow.png"), fullPage: false });
  await expect(dialog.getByRole("button", { name: "Close", exact: true }).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
  await page.reload();
  await page.getByRole("button", { name: "Saved work", exact: true }).click();
  const card = page.getByRole("article", { name: datasetTitle, exact: true });
  await card.getByRole("button", { name: /Review CSV browser review/ }).click();
  await expect(page.getByRole("table", { name: "Imported Dataset rows" }).getByRole("cell", { name: "<20", exact: true })).toBeVisible();
  expect(writes.some(url => /sessions|execute|generate/.test(url))).toBe(false);
});


test("web proxy accepts a report above 1 MB and preserves the Gateway upload limit", async ({ request }) => {
  test.skip(process.env.CATALYST_CSV_BROWSER !== "1", "Requires the real web proxy and configured import storage");
  const path = "/v1/catalyst/dashboard-builder/datasets/imports?filename=large-fixture.csv";
  const report = Buffer.from("ID,Notes\n" + ("001," + "x".repeat(600) + "\n").repeat(2000));
  expect(report.byteLength).toBeGreaterThan(1024 * 1024);
  const uploaded = await request.post(path, { data: report, headers: { "Content-Type": "text/csv" } });
  expect(uploaded.status()).toBe(201);
  const draft = await uploaded.json();
  expect(draft.preview.rowCount.total).toBe(2000);
  expect(draft.datasetVersionId).toBeNull();
  const oversized = await request.post(path, { data: Buffer.alloc(10 * 1024 * 1024 + 1, "x"), headers: { "Content-Type": "text/csv" } });
  expect(oversized.status()).toBe(413);
  expect((await oversized.json()).error.code).toBe("file_too_large");
});
