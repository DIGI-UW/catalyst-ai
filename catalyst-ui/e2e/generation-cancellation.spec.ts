import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { installBaselineApi } from "./support/baseline-fixture";

// Browser scaffolding: a real stalled HTTP response proves client disconnect.
// Actual Gateway/Hub/model transport has separate integration checks.
for (const theme of ["light", "dark"]) {
  for (const empty of [true, false]) {
    test(`stop ${empty ? "initial question" : "follow-up"} in ${theme} mode`, async ({ page }, testInfo) => {
      await installBaselineApi(page, { empty });
      await page.addInitScript(`window.localStorage.setItem("catalyst.theme", "${theme}")`);
      let requestCount = 0;
      let disconnected = false;
      const upstream = createServer((request, response) => {
        request.resume();
        requestCount += 1;
        response.once("close", () => { disconnected = true; });
      });
      await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
      try {
        const upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/prepare`;
        await page.route("**/v1/catalyst/workbench/sessions/**", async (route) => {
          if (route.request().method() !== "POST") return route.fallback();
          await route.continue({ url: upstreamUrl });
        });
        const executions: string[] = [];
        page.on("request", (request) => {
          if (request.url().endsWith("/execute")) executions.push(request.url());
        });
        await page.goto("/");
        const draft = page.getByRole("textbox", { name: empty ? "Your question" : "Ask a follow-up" });
        const question = "Count tests by month, including missing dates";
        await draft.fill(question);
        const reviewCount = await page.getByRole("button", { name: "Review results" }).count();
        await page.getByRole("button", { name: "Continue" }).click();
        await expect.poll(() => requestCount).toBe(1);
        expect(disconnected).toBe(false);
        const stop = page.getByRole("button", { name: "Stop preparing" });
        await expect(stop).toBeInViewport();
        await page.screenshot({ path: testInfo.outputPath("preparing.png") });
        await page.setViewportSize({ width: 390, height: 720 });
        await expect(stop).toBeInViewport();
        await stop.click();
        await expect.poll(() => disconnected).toBe(true);
        await expect(draft).toBeEnabled();
        await expect(draft).toBeFocused();
        await expect(draft).toHaveValue(question);
        await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeEnabled();
        await page.screenshot({ path: testInfo.outputPath("stopped-narrow.png") });
        await expect(draft).toHaveValue(question);
        await expect(page.getByRole("button", { name: "Review results" })).toHaveCount(reviewCount);
        if (!empty) {
          await page.getByRole("button", { name: "Review results" }).last().click();
          const review = page.getByRole("dialog", { name: "Review panel" });
          await expect(review.getByRole("cell", { name: "152", exact: true })).toBeVisible();
        }
        expect(executions).toEqual([]);
        expect(requestCount).toBe(1);
      } finally {
        upstream.closeAllConnections();
        await new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve()));
      }
    });
  }
}
