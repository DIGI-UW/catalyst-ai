import { expect, test } from "@playwright/test";
import { buildSession, installBaselineApi, SESSION_ID } from "./support/baseline-fixture";

test("saved SQL opens explicitly, keeps typed values and the earlier draft, and survives a session reload", async ({ page }, testInfo) => {
  await installBaselineApi(page);
  const original = buildSession().session;
  const sessions = new Map<string, Record<string, unknown>>([[SESSION_ID, original]]);
  const saved = {
    id: "query-1", versionId: "query-v2", ordinal: 2, configurationDigest: "d".repeat(64), createdAt: original.createdAt,
    configuration: {
      title: "Monthly registrations", source: { dataSourceId: "openmrs", dialect: "spark", sessionId: "missing-history", executionId: "old-run" },
      parameterizedSql: "select count(*) from patient WHERE registered >= :since",
      compiledSql: "select count(*) from patient WHERE registered >= '2026-01-01'",
      parameters: [{ name: "since", type: "date", value: "2026-01-01", source: "human" }],
    },
  };
  const mutations: Array<{ path: string; body: Record<string, unknown> }> = [];
  let failNextCreate = true;
  await page.route("**/v1/catalyst/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1/catalyst", "");
    const body = request.method() === "GET" ? {} : request.postDataJSON();
    if (request.method() !== "GET") mutations.push({ path, body });
    const json = (value: unknown, status = 200) => route.fulfill({ json: value, status });
    if (path === "/dashboard-builder/datasets") return json({ contractVersion: "catalyst.dashboard-builder.v1", kind: "dataset", items: [saved] });
    if (path === "/workbench/sessions" && request.method() === "POST") {
      if (failNextCreate) { failNextCreate = false; return json({ detail: "Connection interrupted" }, 503); }
      const session = { ...original, ...body, contractVersion: original.contractVersion, sessionId: "copied-session", question: "", currentVersion: null,
        currentVersionId: null, versions: [], executions: [], validations: [], latestValidation: null };
      sessions.set("copied-session", session);
      return json(session, 201);
    }
    if (path.endsWith("/browser-state")) {
      const id = path.split("/").at(-2)!;
      const session = { ...sessions.get(id), browserState: body.browserState };
      sessions.set(id, session);
      return json(session);
    }
    if (path === "/workbench/sessions/copied-session/turns") return json({
      ...buildSession().timeline, sessionId: "copied-session", currentTurnId: null, currentVersion: null, turns: [],
    });
    const id = path.split("/").at(-1)!;
    if (path.startsWith("/workbench/sessions/") && sessions.has(id)) return json(sessions.get(id));
    if (path.includes("missing-history")) return json({ detail: "History unavailable" }, 404);
    return route.fallback();
  });
  await page.goto("/");
  const followup = page.getByRole("textbox", { name: "Ask a follow-up" });
  await followup.fill("Keep missing months in my earlier question");
  await page.getByText("View or edit SQL", { exact: true }).click();
  const editor = page.getByRole("textbox", { name: "SQL query" });
  await editor.fill("SELECT 17 AS earlier_draft");
  await page.getByRole("button", { name: "Saved work", exact: true }).click();
  const savedCard = page.getByRole("article", { name: "Monthly registrations" });
  await expect(savedCard).toBeVisible();
  await expect(page.getByTestId("ask-openelis-jump")).not.toBeVisible();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["Light", "Dark"]) {
      await page.getByText(/View options/).click();
      await page.getByRole("radio", { name: theme, exact: true }).check();
      await page.keyboard.press("Escape");
      for (const name of ["Review Monthly registrations", "Create chart or table", "Start from this SQL"]) {
        const action = savedCard.getByRole("button", { name, exact: true });
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeInViewport();
        const box = (await action.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      expect(await page.evaluate<boolean>("document.documentElement.scrollWidth > window.innerWidth")).toBe(false);
      await savedCard.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`saved-library-${theme}-${width}.png`) });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Review Monthly registrations" }).click();
  const review = page.getByRole("dialog", { name: "Review panel" });
  await expect(review.getByText(/Historical rows and run details/)).toBeVisible();
  await review.getByText("Saved SQL and values", { exact: true }).click();
  await expect(review.getByText(saved.configuration.parameterizedSql, { exact: true })).toBeVisible();
  await review.getByRole("button", { name: "Start from this SQL", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Start from saved SQL" });
  await expect(confirm.getByText(/using openmrs/)).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  expect(mutations).toEqual([]);
  await page.getByRole("button", { name: "Start from this SQL", exact: true }).click();
  await confirm.getByRole("button", { name: "Keep my draft and start" }).click();
  await expect(confirm.getByText("Connection interrupted", { exact: true })).toBeVisible();
  await confirm.getByRole("button", { name: "Keep my draft and start" }).click();
  await expect(confirm).not.toBeVisible();
  await expect(editor).toHaveText(saved.configuration.parameterizedSql);
  await expect(editor).toBeFocused();
  await expect(page.getByLabel("Parameter 1 value")).toHaveValue("2026-01-01");
  await editor.fill("select count(*) from patient WHERE registered >= :since -- copied draft");
  await page.getByLabel("Parameter 1 value").fill("2026-02-01");
  await page.getByText(/View options/).click();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await page.getByText("Advanced mode", { exact: true }).click();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: testInfo.outputPath("saved-sql-dark.png") });
  await page.setViewportSize({ width: 390, height: 720 });
  await expect(page.getByRole("button", { name: "Run query", exact: true })).toBeVisible();
  expect(await page.evaluate<boolean>("document.documentElement.scrollWidth > window.innerWidth")).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("saved-sql-narrow.png") });
  await page.getByRole("button", { name: "Return to previous draft" }).click();
  await expect(followup).toHaveValue("Keep missing months in my earlier question");
  await expect(editor).toHaveText("SELECT 17 AS earlier_draft");
  await page.getByRole("button", { name: "Saved work", exact: true }).click();
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(editor).toHaveText("SELECT 17 AS earlier_draft");
  expect(mutations.every(({ path }) => path.endsWith("/browser-state") || path === "/workbench/sessions")).toBe(true);
  const copied = sessions.get("copied-session")!;
  expect(copied.dataSourceId).toBe("openmrs");
  expect(copied.browserState).toMatchObject({ savedQueryOrigin: { versionId: "query-v2", dialect: "spark" },
    editorDraft: { sql: "select count(*) from patient WHERE registered >= :since -- copied draft",
      parameters: [{ name: "since", type: "date", value: "2026-02-01", source: "human" }] } });
  expect(saved.configuration.parameters[0]!.value).toBe("2026-01-01");
  await page.reload();
  await expect(editor).toHaveText("SELECT 17 AS earlier_draft");
  await expect(followup).toHaveValue("Keep missing months in my earlier question");
});
