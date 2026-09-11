import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { expect, test, type Locator } from "@playwright/test";
import type {
  DashboardBuilderEntity,
  DashboardPublication,
  WorkbenchExecution,
  WorkbenchSession,
} from "../src/features/query/types";
import { DemoMilestones } from "./support/demo-milestones";
import { runSupersetImport } from "./support/superset-import";

// One real journey per source. The video project adds readable holds to the
// same assertions; it does not substitute responses or reset retained data.
// Run with one worker: both sources share the operator's current outbox pointer.
test.describe.configure({ mode: "serial" });

// Local checks use a ten-minute generation window. A live deployment can
// deliberately configure a longer Gateway/Hub budget; its evidence run must
// wait for that declared budget instead of timing out before the UI receives
// the completed draft.
const configuredGenerationTimeout = process.env.PLAYWRIGHT_GENERATION_TIMEOUT_MS;
const generationTimeoutMs = configuredGenerationTimeout === undefined
  ? 600_000
  : Number(configuredGenerationTimeout);

if (!Number.isSafeInteger(generationTimeoutMs) || generationTimeoutMs < 1_000) {
  throw new Error("PLAYWRIGHT_GENERATION_TIMEOUT_MS must be a whole number of milliseconds of at least 1000.");
}

// Each source performs an initial draft and a follow-up. Leave ten minutes for
// execution, saving, import, and rendering around the configured generation
// budget so the test-level timeout does not preempt either wait.
test.setTimeout(generationTimeoutMs * 2 + 600_000);
test.use({ colorScheme: "light" });

for (const source of ["openelis", "openmrs-hiv"]) {
  test(`${source}: question to saved work and a rendered Dashboard`, async ({ page }, info) => {
    test.skip(process.env.PLAYWRIGHT_LIVE !== "true", "Requires the real stack and CATALYST_HARNESS_DIR.");
    const filming = info.project.name === "demo-video";
    const productStory = process.env.CATALYST_DEMO_STORY === "true";
    const timing = new DemoMilestones(`full-scenario-${source}`);
    const label = source === "openelis" ? "Laboratory" : "OpenMRS";
    const runId = process.env.CATALYST_DEMO_RUN_ID?.trim() || randomUUID().slice(0, 8);
    const scenario = source === "openmrs-hiv"
      ? {
          queryTitle: `OpenMRS CD4 monitoring · ${runId}`,
          dashboardTitle: `OpenMRS CD4 monitoring overview · ${runId}`,
          chartTitles: [
            `OpenMRS CD4 monitoring table · ${runId}`,
            `OpenMRS CD4 results by gender · ${runId}`,
          ],
          question: "Count CD4 count results from 2026-01-01 through 2026-12-31 by month. Return month and result_count.",
          schemaSearch: "observation",
          followup: "Break those monthly CD4 count results down by patient gender, including missing gender. Keep the same 2026 date range. Return month, gender, and result_count.",
          expectedColumns: ["MONTH", "gender", "result_count"],
          chartKinds: ["table", "grouped_bar"],
        }
      : {
          queryTitle: `${label} patient counts · ${runId}`,
          dashboardTitle: `${label} overview · ${runId}`,
          chartTitles: [`${label} patient table · ${runId}`, `${label} patients by gender · ${runId}`],
          question: "How many patients are there?",
          schemaSearch: "patient",
          followup: "Break down that patient count by gender, including patients with missing gender. Return gender and patient_count.",
          expectedColumns: ["gender", "patient_count"],
          chartKinds: ["table", "grouped_bar"],
        };
    const queryTitle = scenario.queryTitle;
    const { dashboardTitle, chartTitles } = scenario;
    const executions: WorkbenchExecution[] = [];
    const evidence: unknown[] = [];
    const pending: Promise<void>[] = [];
    const recordedSessions: WorkbenchSession[] = [];
    let executionRequests = 0;
    page.on("request", request => {
      if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/execute")) executionRequests++;
    });
    page.on("response", response => {
      const request = response.request();
      const path = new URL(response.url()).pathname;
      if (path.match(/\/workbench\/sessions(?:\/[^/]+)?$/) && response.ok()) {
        pending.push(response.json().then(body => {
          if (Array.isArray(body.versions)) recordedSessions.push(body as WorkbenchSession);
        }));
      }
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
      if (productStory && button === "Get results") {
        await expect.poll(() => recordedSessions.flatMap(session => session.versions)
          .find(version => version.versionId === execution.versionId)).toBeDefined();
        const version = recordedSessions.flatMap(session => session.versions)
          .find(item => item.versionId === execution.versionId)!;
        expect(version.authorType).not.toBe("human");
        expect(execution.query).toEqual({ sql: version.sql, parameters: version.parameters });
        const collaboration = version.provenance.modelCollaboration as { reviewer?: { model?: string; decision?: string } };
        expect(collaboration?.reviewer?.model).toBeTruthy();
        expect(["approve", "repair"]).toContain(collaboration?.reviewer?.decision);
        await expect(page.getByText("AI reviewed", { exact: true }).last()).toBeVisible();
        await expect(page.locator(".query-turn__unreviewed")).toHaveCount(0);
      }
      await page.getByRole("button", { name: "Review results", exact: true }).last().click();
      await expect(panel.getByRole("table", { name: "Result rows" })).toBeVisible();
      return execution;
    };
    try {
      await page.goto(`/?dataSource=${source}`);
      const draft = page.getByRole("textbox", { name: "Your question", exact: true });
      await expect(draft).toBeVisible();
      timing.mark("source-selected");
      await type(draft, scenario.question);
      await page.getByRole("button", { name: "Expand", exact: true }).click();
      await expect(draft).toHaveValue(scenario.question);
      timing.mark("question-typed");
      await dwell(5000);
      await page.getByRole("button", { name: "What data is available?" }).click();
      const browser = page.getByRole("complementary", { name: "Available data" });
      await browser.getByRole("searchbox", { name: "Search tables and fields" }).fill(scenario.schemaSearch);
      await expect(browser.locator(".cds--accordion__item").first()).toBeVisible({ timeout: 30000 });
      expect(executionRequests).toBe(0);
      timing.mark("schema-visible");
      await page.screenshot({ path: info.outputPath("schema-and-draft.png") });
      await dwell(8000);
      await browser.getByRole("button", { name: "Back to your question" }).click();
      await expect(draft).toBeFocused();
      await expect(draft).toHaveValue(scenario.question);
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
      await expect(page.getByRole("button", { name: "Get results", exact: true }))
        .toBeEnabled({ timeout: generationTimeoutMs });
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
      await type(followup, scenario.followup);
      timing.mark("followup-typed");
      await dwell(5000);
      timing.mark("prepare-2");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(followup).toHaveValue("", { timeout: generationTimeoutMs });
      await expect(page.getByRole("button", { name: "Get results", exact: true }))
        .toBeEnabled({ timeout: generationTimeoutMs });
      expect(executionRequests).toBe(1);
      timing.mark("ready-2");
      await dwell(5000);
      let grouped = await showResults("Get results", 2);
      expect(grouped.result!.columns.map(column => column.name.toLowerCase())).toEqual(scenario.expectedColumns.map(name => name.toLowerCase()));
      timing.mark("result-2");
      await dwell(8000);
      if (productStory && source === "openelis") {
        await page.keyboard.press("Escape");
        await type(followup, "A colleague supplied this patient summary, but sex is not a field. Please fix it using the available data: SELECT sex AS gender, COUNT(*) AS patient_count FROM openelis.patient GROUP BY sex");
        timing.mark("provided-sql");
        await dwell(8000);
        timing.mark("repair-prepare");
        await page.getByRole("button", { name: "Continue", exact: true }).click();
        await expect(followup).toHaveValue("", { timeout: 600000 });
        await expect(page.getByRole("button", { name: "Get results", exact: true })).toBeEnabled();
        expect(executionRequests).toBe(2);
        timing.mark("repair-ready");
        await dwell(5000);
        grouped = await showResults("Get results", 3);
        expect(grouped.result!.columns.map(column => column.name.toLowerCase())).toEqual(["gender", "patient_count"]);
        timing.mark("repair-result");
        await dwell(8000);
      }
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
      const beforeReuse = executionRequests;
      await page.getByText(/View options/).click();
      // Keep public recordings visually consistent; the ordinary run still
      // exercises dark appearance with the same saved-work assertions.
      await page.getByRole("radio", { name: filming ? "Light" : "Dark", exact: true }).check();
      await page.getByText("Advanced mode", { exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(page.locator("#catalyst-advanced-mode")).toBeChecked();
      await expect(page.locator(".application")).toHaveAttribute("data-theme", filming ? "g10" : "g100");
      timing.mark("reused-sql");
      await page.screenshot({ path: info.outputPath(`reused-sql-${filming ? "light" : "dark"}.png`) });
      await dwell(8000);
      // Exercise a real engine failure in the copied draft. The saved version
      // stays intact, and correcting the draft must not lose its typed values.
      const savedSql = dataset.configuration.parameterizedSql as string;
      let failedExecution: WorkbenchExecution | null = null;
      if (!productStory) {
        const invalidSql = `SELECT catalyst_missing_column FROM (${savedSql.replace(/;\s*$/, "")}) AS saved_query`;
        await editor.fill(invalidSql);
        const failureResponse = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/execute"));
        await page.getByRole("button", { name: "Run query", exact: true }).click();
        const failedResponse = await failureResponse;
        expect(failedResponse.ok()).toBe(true);
        failedExecution = await failedResponse.json() as WorkbenchExecution;
        expect(failedExecution.status).toBe("failed");
        expect(failedExecution.query.sql).toBe(invalidSql);
        expect(failedExecution.query.parameters).toEqual(grouped.query.parameters);
        expect(failedExecution.databaseDiagnostic?.message).toContain("catalyst_missing_column");
        expect(executionRequests).toBe(3);
        const diagnostic = page.getByRole("alert").filter({ hasText: "catalyst_missing_column" }).first();
        await diagnostic.scrollIntoViewIfNeeded();
        await expect(diagnostic).toBeInViewport();
        await expect.poll(async () => (await editor.locator(".cm-line").allTextContents()).join("\n")).toBe(invalidSql);
        timing.mark("reuse-failed");
        await page.screenshot({ path: info.outputPath("reuse-failed.png") });
        await dwell(8000);
        await editor.fill(savedSql);
      }
      const reusedExecution = await showResults("Run query", beforeReuse + (productStory ? 1 : 2));
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
      for (const [index, kind] of scenario.chartKinds.entries()) {
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
      const renderedRows = await table.getByRole("row").evaluateAll(rows => rows.map(row =>
        [...row.querySelectorAll('[role="cell"]')].map(cell => cell.textContent ?? ""),
      ));
      const displayed = (value: string) => value
        .replace("T", " ")
        .replace(/\.\d{3}Z$/, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      for (const row of reusedExecution.result!.rows) {
        const cells = row.map(cell => cell.type === "null" ? "NULL" : String(cell.value));
        // Superset formats timestamps for display (space rather than ISO T),
        // but every value of the originating row must remain visible together.
        expect(renderedRows.some(rendered =>
          rendered.length === cells.length
          && rendered.every((cell, index) => displayed(cell) === displayed(cells[index]!)),
        )).toBe(true);
      }
      timing.mark("dashboard-rendered");
      await dwell(8000);
      await page.screenshot({ path: info.outputPath("superset-rendered.png") });
      timing.mark("end");
      writeFileSync(info.outputPath("proof.json"), JSON.stringify({ source, dataset, reused, first, revised, bundle, dashboardUrl, failedExecution, execution: reusedExecution }, null, 2));
    } finally {
      await Promise.allSettled(pending);
      writeFileSync(info.outputPath("requests-and-results.json"), JSON.stringify({ source, executionRequests, executions, evidence }, null, 2));
      timing.save();
    }
  });
}
