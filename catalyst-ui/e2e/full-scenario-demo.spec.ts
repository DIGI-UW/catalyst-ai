import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { expect, test, type Locator } from "@playwright/test";
import type {
  DashboardBuilderEntity,
  DashboardPublication,
  WorkbenchExecution,
} from "../src/features/query/types";
import { DemoMilestones } from "./support/demo-milestones";
import { runSupersetImport } from "./support/superset-import";

// One real journey per source. The video project adds readable holds to the
// same assertions; it does not substitute responses or reset retained data.
// Run with one worker: both sources share the operator's current outbox pointer.
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);

for (const source of ["openelis", "openmrs-hiv"]) {
  test(`${source}: question to saved work and a rendered Dashboard`, async ({ page }, info) => {
    test.skip(process.env.PLAYWRIGHT_LIVE !== "true", "Requires the real stack and CATALYST_HARNESS_DIR.");
    const filming = info.project.name === "demo-video";
    const timing = new DemoMilestones(`full-scenario-${source}`);
    const label = source === "openelis" ? "Laboratory" : "OpenMRS";
    const runId = process.env.CATALYST_DEMO_RUN_ID?.trim() || randomUUID().slice(0, 8);
    const queryTitle = `${label} patient counts · ${runId}`;
    const dashboardTitle = `${label} overview · ${runId}`;
    const chartTitles = [`${label} patient table · ${runId}`, `${label} patients by gender · ${runId}`];
    const executions: WorkbenchExecution[] = [];
    const evidence: unknown[] = [];
    const pending: Promise<void>[] = [];
    let executionRequests = 0;
    page.on("request", request => {
      if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/execute")) executionRequests++;
    });
    page.on("response", response => {
      const request = response.request();
      const path = new URL(response.url()).pathname;
      if (request.method() === "POST" && path.startsWith("/v1/catalyst/")) {
        pending.push(response.json().then(body => {
          evidence.push({ path, status: response.status(), request: request.postDataJSON(), response: body });
          if (path.endsWith("/execute") && response.ok()) executions.push(body as WorkbenchExecution);
        }));
      }
    });
    const dwell = async (ms: number) => { if (filming) await page.waitForTimeout(ms); };
    const type = async (locator: Locator, text: string) => {
      if (filming) await locator.pressSequentially(text, { delay: 55 });
      else await locator.fill(text);
    };
    const panel = page.getByRole("dialog", { name: "Review panel" });
    const library = async (name: string) => {
      await page.getByRole("button", { name: "Saved work", exact: true }).click();
      await page.getByRole("navigation", { name: "Saved work", exact: true })
        .getByRole("button", { name, exact: true }).click();
    };
    const saveQuery = async (name: string): Promise<DashboardBuilderEntity> => {
      await panel.getByLabel("Query name", { exact: true }).fill(name);
      const response = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/dashboard-builder/datasets"));
      await panel.getByRole("button", { name: "Save query", exact: true }).click();
      const saved = await response;
      expect(saved.ok()).toBe(true);
      const dataset = await saved.json() as DashboardBuilderEntity;
      expect(dataset.configuration.source).toMatchObject({ dataSourceId: source });
      await page.keyboard.press("Escape");
      await expect(panel).not.toBeVisible();
      return dataset;
    };
    const showResults = async (button: string, count: number): Promise<WorkbenchExecution> => {
      const response = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/execute"));
      await page.getByRole("button", { name: button, exact: true }).click();
      const completed = await response;
      expect(completed.ok()).toBe(true);
      const execution = await completed.json() as WorkbenchExecution;
      expect(execution.status).toBe("succeeded");
      expect(execution.result?.rows.length).toBeGreaterThan(0);
      expect(executionRequests).toBe(count);
      await page.getByRole("button", { name: "Review results", exact: true }).last().click();
      await expect(panel.getByRole("table", { name: "Result rows" })).toBeVisible();
      return execution;
    };
    try {
      await page.goto(`/?dataSource=${source}`);
      const draft = page.getByRole("textbox", { name: "Your question", exact: true });
      await expect(draft).toBeVisible();
      timing.mark("source-selected");
      await type(draft, "How many patients are there?");
      await page.getByRole("button", { name: "Expand", exact: true }).click();
      await expect(draft).toHaveValue("How many patients are there?");
      timing.mark("question-typed");
      await dwell(5000);
      await page.getByRole("button", { name: "What data is available?" }).click();
      const browser = page.getByRole("complementary", { name: "Available data" });
      await browser.getByRole("searchbox", { name: "Search tables and fields" }).fill("patient");
      await expect(browser.locator(".cds--accordion__item").first()).toBeVisible({ timeout: 30000 });
      expect(executionRequests).toBe(0);
      timing.mark("schema-visible");
      await page.screenshot({ path: info.outputPath("schema-and-draft.png") });
      await dwell(8000);
      await browser.getByRole("button", { name: "Back to your question" }).click();
      await expect(draft).toBeFocused();
      await expect(draft).toHaveValue("How many patients are there?");
      await browser.getByRole("button", { name: "Close available data" }).click();
      await page.getByRole("button", { name: "Restore", exact: true }).click();
      // An explicit profile is honored exactly. Otherwise the existing UI's
      // configured default is used and captured in the session evidence.
      if (process.env.CATALYST_DEMO_PROFILE) {
        await page.getByText("Query settings", { exact: true }).click();
        await page.getByRole("combobox", { name: "Model profile" }).selectOption(process.env.CATALYST_DEMO_PROFILE);
        await page.getByText("Query settings", { exact: true }).click();
      }
      timing.mark("prepare-1");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.getByRole("button", { name: "Get results", exact: true })).toBeEnabled({ timeout: 600000 });
      expect(executionRequests).toBe(0);
      timing.mark("ready-1");
      await dwell(5000);
      await showResults("Get results", 1);
      timing.mark("result-1");
      await page.screenshot({ path: info.outputPath("result-1.png") });
      await dwell(8000);
      await panel.getByText("Technical details", { exact: true }).click();
      await panel.getByText(/Query v\d+ SQL snapshot/).click();
      await panel.locator("pre").scrollIntoViewIfNeeded();
      await expect(panel.locator("pre")).toBeInViewport();
      timing.mark("provenance-1");
      await dwell(8000);
      await page.keyboard.press("Escape");
      const followup = page.getByRole("textbox", { name: "Ask a follow-up", exact: true });
      await type(followup, "Break down that patient count by gender, including patients with missing gender. Return gender and patient_count.");
      timing.mark("followup-typed");
      await dwell(5000);
      timing.mark("prepare-2");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(followup).toHaveValue("", { timeout: 600000 });
      await expect(page.getByRole("button", { name: "Get results", exact: true })).toBeEnabled();
      expect(executionRequests).toBe(1);
      timing.mark("ready-2");
      await dwell(5000);
      const grouped = await showResults("Get results", 2);
      expect(grouped.result!.columns.map(column => column.name)).toEqual(["gender", "patient_count"]);
      timing.mark("result-2");
      await dwell(8000);
      const dataset = await saveQuery(queryTitle);
      timing.mark("saved-query");
      await followup.fill("Keep this question for later");
      await library("Saved queries");
      const savedCard = page.getByRole("article", { name: queryTitle, exact: true });
      await savedCard.scrollIntoViewIfNeeded();
      await dwell(5000);
      await savedCard.getByRole("button", { name: "Start from this SQL", exact: true }).click();
      await page.getByRole("dialog", { name: "Start from saved SQL" })
        .getByRole("button", { name: "Keep my draft and start" }).click();
      const editor = page.getByRole("textbox", { name: "SQL query", exact: true });
      // CodeMirror renders separate line elements; textContent joins them
      // without newlines even when the saved SQL is loaded correctly.
      await expect.poll(async () => (await editor.locator(".cm-line").allTextContents()).join("\n"))
        .toBe(dataset.configuration.parameterizedSql);
      expect(executionRequests).toBe(2);
      await page.getByText(/View options/).click();
      await page.getByRole("radio", { name: "Dark", exact: true }).check();
      await page.getByText("Advanced mode", { exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(page.locator("#catalyst-advanced-mode")).toBeChecked();
      timing.mark("reused-sql");
      await page.screenshot({ path: info.outputPath("reused-sql-dark.png") });
      await dwell(8000);
      const reusedExecution = await showResults("Run query", 3);
      expect(reusedExecution.query).toEqual(grouped.query);
      timing.mark("reused-result");
      await dwell(8000);
      const reused = await saveQuery(`${queryTitle} — reused`);
      expect(reused.versionId).not.toBe(dataset.versionId);
      expect(reused.configuration.source).toMatchObject({ dataSourceId: source, turnId: null });
      expect(reused.configuration.parameterizedSql).toBe(dataset.configuration.parameterizedSql);
      expect(reused.configuration.parameters).toEqual(dataset.configuration.parameters);
      await page.getByRole("button", { name: "Return to previous draft" }).click();
      await expect(followup).toHaveValue("Keep this question for later");
      await page.getByText(/View options/).click();
      await page.getByRole("radio", { name: "Light", exact: true }).check();
      await page.getByText("Advanced mode", { exact: true }).click();
      await page.keyboard.press("Escape");
      timing.mark("reuse-complete");
      await library("Charts and tables");
      const chartIds: string[] = [];
      for (const [index, kind] of ["table", "grouped_bar"].entries()) {
        await page.getByRole("button", { name: "New chart or table", exact: true }).click();
        await panel.getByLabel("Saved query", { exact: true }).selectOption(reused.versionId);
        await panel.getByLabel("Chart name", { exact: true }).fill(chartTitles[index]!);
        await panel.getByLabel("Visualization", { exact: true }).selectOption(kind);
        await dwell(5000);
        const response = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/dashboard-builder/widgets"));
        await panel.getByRole("button", { name: "Save chart or table", exact: true }).click();
        const saved = await response;
        expect(saved.ok()).toBe(true);
        chartIds.push((await saved.json() as DashboardBuilderEntity).versionId);
        await expect(panel).not.toBeVisible();
        timing.mark(`widget-${kind}`);
      }
      await library("Dashboards");
      await page.getByRole("button", { name: "New Dashboard", exact: true }).click();
      await panel.getByLabel("Dashboard name").fill(dashboardTitle);
      for (const checkbox of await panel.getByRole("checkbox").all()) await checkbox.uncheck();
      for (const title of chartTitles) {
        await panel.getByRole("checkbox", { name: title, exact: true }).check();
        await panel.getByLabel(`Width of ${title}`).selectOption("6");
      }
      timing.mark("arrangement");
      await dwell(8000);
      const save = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/dashboard-builder/dashboards"));
      await panel.getByRole("button", { name: "Save Dashboard", exact: true }).click();
      const savedResponse = await save;
      expect(savedResponse.ok()).toBe(true);
      const first = await savedResponse.json() as DashboardBuilderEntity;
      await expect(panel).not.toBeVisible();
      await page.reload();
      await library("Dashboards");
      await page.getByRole("article", { name: `${dashboardTitle} version 1`, exact: true })
        .getByRole("button", { name: `Review and arrange ${dashboardTitle}`, exact: true }).click();
      for (const title of chartTitles) await expect(panel.getByLabel(`Width of ${title}`)).toHaveValue("6");
      await panel.getByRole("button", { name: `Move ${chartTitles[1]} earlier`, exact: true }).click();
      timing.mark("arrangement-restored");
      await page.screenshot({ path: info.outputPath("arrangement-restored.png") });
      await dwell(8000);
      const revise = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/dashboard-builder/dashboards"));
      await panel.getByRole("button", { name: "Save new Dashboard version", exact: true }).click();
      const revisedResponse = await revise;
      expect(revisedResponse.ok()).toBe(true);
      const revised = await revisedResponse.json() as DashboardBuilderEntity;
      expect(revised.id).toBe(first.id);
      expect(revised.ordinal).toBe(2);
      expect(revised.configuration.widgets).toEqual([
        expect.objectContaining({ versionId: chartIds[1], width: 6 }),
        expect.objectContaining({ versionId: chartIds[0], width: 6 }),
      ]);
      await expect(panel).not.toBeVisible();
      const card = page.getByRole("article", { name: `${dashboardTitle} version 2`, exact: true });
      const publish = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/publish"));
      await card.getByRole("button", { name: "Publish to Superset", exact: true }).click();
      const publication = await publish;
      expect(publication.ok()).toBe(true);
      const bundle = await publication.json() as DashboardPublication;
      const repeat = await page.request.post(`/v1/catalyst/dashboard-builder/dashboards/${revised.versionId}/publish`);
      expect(repeat.ok()).toBe(true);
      expect((await repeat.json() as DashboardPublication).pointer.bundle.sha256).toBe(bundle.pointer.bundle.sha256);
      timing.mark("bundle-ready");
      await dwell(5000);
      timing.mark("import-started");
      const importedUrl = runSupersetImport(bundle.pointer.bundle.sha256);
      await page.reload();
      await library("Dashboards");
      await expect(card.getByText("Imported", { exact: true })).toBeVisible();
      const openLink = card.getByRole("link", { name: "Open Superset", exact: true });
      await expect(openLink).toBeVisible();
      expect(await openLink.getAttribute("href")).toBe(importedUrl);
      timing.mark("imported-visible");
      await page.screenshot({ path: info.outputPath("import-receipt.png") });
      await dwell(8000);
      // Authenticate outside the published cut. Final rendering stays in the
      // same page, so the recording remains a single continuous source.
      timing.mark("superset-login");
      const supersetBase = process.env.PLAYWRIGHT_SUPERSET_URL ?? "http://127.0.0.1:18088";
      await page.goto(`${supersetBase}/login/`);
      await page.locator("#username").fill(process.env.SUPERSET_ADMIN_USERNAME ?? "admin");
      await page.locator("#password").fill(process.env.SUPERSET_ADMIN_PASSWORD ?? "admin");
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(url => !url.pathname.replace(/\/$/, "").endsWith("/login"));
      const dashboardUrl = new URL(new URL(importedUrl).pathname, supersetBase).toString();
      timing.mark("superset-open");
      await page.goto(dashboardUrl);
      await expect(page.getByText(dashboardTitle, { exact: false }).first()).toBeVisible({ timeout: 120000 });
      await expect(page.locator("canvas").first()).toBeVisible({ timeout: 120000 });
      // Compare the displayed table with the originating recorded result;
      // do not open a second connection or use an obsolete fixture count.
      const table = page.getByRole("table").first();
      await expect(table).toBeVisible({ timeout: 120000 });
      for (const row of reusedExecution.result!.rows) {
        const cells = row.map(cell => cell.type === "null" ? "NULL" : String(cell.value));
        const renderedRow = table.getByRole("row").filter({ has: page.getByText(cells[0], { exact: true }) });
        // Superset labels cells with their column name, not their value.
        await expect(renderedRow.getByRole("cell").nth(1)).toHaveText(cells[1]);
      }
      timing.mark("dashboard-rendered");
      await dwell(8000);
      await page.screenshot({ path: info.outputPath("superset-rendered.png") });
      timing.mark("end");
      writeFileSync(info.outputPath("proof.json"), JSON.stringify({ source, dataset, reused, first, revised, bundle, dashboardUrl, execution: reusedExecution }, null, 2));
    } finally {
      await Promise.allSettled(pending);
      writeFileSync(info.outputPath("requests-and-results.json"), JSON.stringify({ source, executionRequests, executions, evidence }, null, 2));
      timing.save();
    }
  });
}
