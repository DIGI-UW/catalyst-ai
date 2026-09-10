import { expect, test } from "@playwright/test";
import { installBaselineApi } from "./support/baseline-fixture";

test("a saved Dashboard keeps arrangement through failed save, retry and reload", async ({ page }, testInfo) => {
  await installBaselineApi(page);
  const entity = (id: string, configuration: Record<string, unknown>) => ({ id, versionId: `${id}-v1`, ordinal: 1,
    configuration, configurationDigest: "a".repeat(64), createdAt: "2026-09-10T12:00:00Z" });
  const dataset = entity("dataset", { title: "Patient counts", source: {dataSourceId: "openelis"},
    columns: [{name: "count", logicalType: "integer"}], rowCount: {returned: 1}, parameters: [] });
  const widgets = [entity("count", {title: "Patient count", datasetVersionId: dataset.versionId, presentationKind: "big_number"}),
    entity("table", {title: "Patient table", datasetVersionId: dataset.versionId, presentationKind: "table"})];
  const original = entity("dashboard", {title: "Program overview", widgets: widgets.map(item => ({versionId: item.versionId, width: 6}))});
  const dashboards = [original];
  let fail = true;
  const saves: Array<Record<string, unknown>> = [];
  await page.route("**/dashboard-builder/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") {
      if (path.endsWith("/publication")) return route.fulfill({status:404,json:{detail:"No publication"}});
      const [kind, items] = path.endsWith("/datasets") ? ["dataset", [dataset]]
        : path.endsWith("/widgets") ? ["widget", widgets] : path.endsWith("/dashboards") ? ["dashboard", dashboards] : [null, null];
      if (kind) return route.fulfill({json:{contractVersion:"catalyst.dashboard-builder.v1", kind, items}});
      return route.fallback();
    }
    if (path.endsWith("/dashboards")) {
      const body = request.postDataJSON();
      saves.push(body);
      if (fail) { fail=false; return route.fulfill({status:503,json:{detail:"Connection interrupted"}}); }
      const saved = {...original, versionId:"dashboard-v2", ordinal:2,
        configuration:{...original.configuration, widgets:body.widgetVersionIds.map((versionId:string)=>({versionId,width:body.widgetWidths[versionId]}))}};
      dashboards.unshift(saved);
      return route.fulfill({status:201,json:saved});
    }
    return route.fallback();
  });
  const openLibrary = async () => {
    await page.getByRole("button",{name:"Saved work",exact:true}).click();
    await page.getByRole("navigation",{name:"Saved work"}).getByRole("button",{name:"Dashboards",exact:true}).click();
  };
  await page.goto("/");
  await openLibrary();
  await page.getByRole("button",{name:"Review and arrange Program overview"}).click();
  const panel = page.getByRole("dialog",{name:"Review panel"});
  await panel.getByRole("button",{name:"Move Patient table earlier"}).click();
  await panel.getByLabel("Width of Patient table").selectOption("12");
  await panel.getByRole("button",{name:"Save new Dashboard version"}).click();
  await expect(panel.getByText("Connection interrupted",{exact:true})).toBeVisible();
  await expect(panel.getByLabel("Width of Patient table")).toHaveValue("12");
  await panel.getByRole("button",{name:"Save new Dashboard version"}).click();
  await expect(panel).not.toBeVisible();
  expect(saves).toHaveLength(2);
  expect(saves[1]).toMatchObject({baseVersionId:"dashboard-v1", widgetVersionIds:["table-v1","count-v1"], widgetWidths:{"table-v1":12,"count-v1":6}});
  await page.reload();
  await openLibrary();
  await page.getByRole("article",{name:"Program overview version 2"}).getByRole("button",{name:"Review and arrange Program overview"}).click();
  await expect(panel.getByLabel("Width of Patient table")).toHaveValue("12");
  await expect(panel.getByRole("img",{name:"Dashboard layout preview"})).toHaveText("Patient tablePatient count");
  await page.screenshot({path:testInfo.outputPath("arrangement-restored-light.png")});
  await page.keyboard.press("Escape");
  await page.getByText(/View options/).click();
  await page.getByRole("radio",{name:"Dark",exact:true}).check();
  await page.keyboard.press("Escape");
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("article",{name:"Program overview version 2"}).getByRole("button",{name:"Review and arrange Program overview"}).click();
  await panel.getByLabel("Width of Patient table").scrollIntoViewIfNeeded();
  await expect(panel.getByLabel("Width of Patient table")).toBeInViewport();
  expect(await page.evaluate<boolean>("document.documentElement.scrollWidth > window.innerWidth")).toBe(false);
  await page.screenshot({path:testInfo.outputPath("arrangement-restored-dark-narrow.png")});
});
