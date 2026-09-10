import { expect, test } from "@playwright/test";
import { installBaselineApi } from "./support/baseline-fixture";

test("simple navigation and theme changes retain the unfinished question", async ({ page }, testInfo) => {
  await installBaselineApi(page, { empty: true });
  await page.goto("/");
  const question = page.getByRole("textbox", { name: "Your question" });
  await question.fill("Visits by month\nInclude missing dates");
  const primary = page.getByRole("navigation", { name: "Primary" });
  await primary.getByRole("button", { name: "Saved work" }).click();
  const saved = page.getByRole("navigation", { name: "Saved work" });
  await saved.getByRole("button", { name: "Charts and tables" }).click();
  await primary.getByRole("button", { name: "Explore" }).click();
  await expect(question).toHaveValue("Visits by month\nInclude missing dates");
  await primary.getByRole("button", { name: "Saved work" }).click();
  await expect(saved.getByRole("button", { name: "Charts and tables" })).toHaveAttribute("aria-current", "page");
  await primary.getByRole("button", { name: "Explore" }).click();

  for (const theme of ["Dark", "Light"]) {
    await page.getByText(/View options/).click();
    await page.getByRole("radio", { name: theme, exact: true }).check();
    await page.keyboard.press("Escape");
    await expect(page.getByText(/View options/)).toBeFocused();
    await expect(page.locator(".application")).toHaveAttribute("data-theme", theme === "Dark" ? "g100" : "g10");
    await expect(question).toHaveValue("Visits by month\nInclude missing dates");
    await page.screenshot({ path: testInfo.outputPath(`shell-${theme.toLowerCase()}.png`) });
  }

  await page.setViewportSize({ width: 390, height: 640 });
  await expect(question).toBeVisible();
  await page.getByText(/View options/).click();
  await expect(page.getByRole("checkbox", { name: /Advanced mode/ })).toBeInViewport();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await expect(page.locator(".application")).toHaveAttribute("data-theme", "g100");
  const overflow = await page.evaluate<boolean>("document.documentElement.scrollWidth > window.innerWidth");
  expect(overflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("shell-narrow.png") });
});

test("Advanced mode retains edited SQL, selection, undo and follow-up without executing", async ({ page }) => {
  await installBaselineApi(page);
  const executions: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/execute")) executions.push(request.url());
  });
  await page.goto("/");
  const followup = page.getByRole("textbox", { name: "Ask a follow-up" });
  await followup.fill("Keep my follow-up draft");
  const options = page.getByText(/View options/);
  await options.click();
  const advanced = page.getByRole("checkbox", { name: /Advanced mode/ });
  await advanced.check();
  const editor = page.getByRole("textbox", { name: "SQL query" });
  await expect(editor).toBeVisible();
  await editor.fill("SELECT 42 AS answer");
  await editor.press("End");
  await editor.press("Shift+ArrowLeft");
  const selected = await page.evaluate<string>("window.getSelection()?.toString()");
  await advanced.uncheck();
  // The manual edit remains explicitly available even in simple mode.
  await advanced.check();
  await expect(editor).toContainText("SELECT 42 AS answer");
  await editor.focus();
  expect(await page.evaluate<string>("window.getSelection()?.toString()")).toBe(selected);
  await editor.press("ControlOrMeta+z");
  await expect(editor).not.toContainText("SELECT 42 AS answer");
  await expect(followup).toHaveValue("Keep my follow-up draft");
  expect(executions).toEqual([]);
});
