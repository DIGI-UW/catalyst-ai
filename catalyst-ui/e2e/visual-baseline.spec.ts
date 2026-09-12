/**
 * The visual baseline — Checkpoint 1 of the styling roadmap.
 *
 * Every later checkpoint is measured with this. It exists so a token
 * substitution or a theme change can be reviewed as a diff of named surfaces
 * rather than trusted, and so that when a surface moves you can say which
 * change moved it.
 *
 * Run it with `npm run baseline`. Accept intended changes with
 * `npm run baseline -- --update-snapshots`, and say in the pull request which
 * surfaces moved and why.
 *
 * It runs only against the deterministic mock: no models, no database, no
 * clock. Snapshots are platform-suffixed by Playwright, so a set generated on
 * one operating system never silently grades another.
 */
import { expect, test } from "@playwright/test";
import { installBaselineApi } from "./support/baseline-fixture";

/*
  No pixel tolerance, and no per-pixel threshold either.

  Both defaults were measured to be blind, in turn. A 1% pixel ratio missed a
  recoloured 3px border (0.26% of a full-page shot). Removing it left
  Playwright's default `threshold: 0.2`, which compares pixels perceptually --
  and #ffffff against #f4f4f4 is roughly a 4% distance, so an entire surface
  can swap between near-whites and be reported identical. That is exactly the
  change a token migration between neutral greys makes, so the instrument was
  blind to the one thing it was built to watch.

  Verified the hard way: it reported 11/11 while the rail and its nav had
  swapped colours on screen.
*/
const shot = {
  animations: "disabled" as const,
  // A blinking caret is not a design change; it moved 2% of the editor shot.
  caret: "hide" as const,
  threshold: 0,
  /*
    An absolute two-pixel allowance, not a ratio. A ratio scales with the
    image and is how the first two versions of this went blind. Two pixels
    cannot conceal anything this instrument exists to catch -- the surface
    inversion it missed moved tens of thousands -- but it does absorb the
    single antialiased pixel on an element boundary that otherwise makes the
    whole set flap.
  */
  maxDiffPixels: 2,
};

const THEMES = ["light", "dark"] as const;

/** Pin the preference before the app boots, so no flash of the other theme. */
const useTheme = async (page: import("@playwright/test").Page, theme: string) => {
  await page.addInitScript(
    `window.localStorage.setItem("catalyst.theme", ${JSON.stringify("PLACEHOLDER")})`.replace(
      "PLACEHOLDER",
      theme,
    ),
  );
};

for (const theme of THEMES) {
test.describe(`visual baseline (${theme})`, () => {
  test("empty session", async ({ page }) => {
    await useTheme(page, theme);
    await installBaselineApi(page, { empty: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await expect(page.getByLabel("Your question")).toBeVisible();
    await expect(page).toHaveScreenshot(`empty-session-${theme}.png`, {
      ...shot,
      fullPage: true,
    });
  });

  test("thread with a run, a failure and a repair", async ({ page }) => {
    await useTheme(page, theme);
    await installBaselineApi(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    // Every turn retains its summary; only query evidence is collapsed.
    await expect(page.locator(".query-turn__dataset").first()).toBeVisible();
    await expect(page).toHaveScreenshot(`thread-${theme}.png`, { ...shot, fullPage: true });
  });

  test("a failed run's cell", async ({ page }) => {
    await useTheme(page, theme);
    await installBaselineApi(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    // The database failure is visible without opening technical evidence.
    await expect(page.getByText('column "test_type" does not exist')).toBeVisible();
    await expect(page.locator("#turn-2")).toHaveScreenshot(`failed-run-${theme}.png`, shot);
  });

  test("compact result summary", async ({ page }) => {
    await useTheme(page, theme);
    await installBaselineApi(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    const tile = page.locator(".query-turn__dataset").first();
    await expect(tile).toBeVisible();
    await expect(tile).toHaveScreenshot(`dataset-tile-${theme}.png`, shot);
  });

  test("dataset review dialog", async ({ page }) => {
    await useTheme(page, theme);
    await installBaselineApi(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page
      .locator(".query-turn__dataset")
      .first()
      .getByRole("button", { name: "Review results" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Review panel" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveScreenshot(`review-dialog-${theme}.png`, shot);
  });

  for (const section of ["Saved queries", "Charts and tables", "Dashboards"] as const) {
    test(`${section.toLowerCase()} library`, async ({ page }) => {
      await useTheme(page, theme);
      await installBaselineApi(page);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto("/");
      await page.getByRole("button", { name: "Saved work", exact: true }).click();
      const navButton = page.getByRole("navigation", {name: "Saved work", exact: true}).getByRole("button", {name: section, exact: true});
      await navButton.click();
      await expect(navButton).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { level: 1, name: section })).toBeVisible();
      await expect(page.getByText("Loading library…")).toHaveCount(0);
      await expect(page.locator(".builder-library")).toHaveScreenshot(`library-${section.toLowerCase()}-${theme}.png`,
        shot,
      );
    });
  }

  // States CP-3 changed and nothing was watching: the editor's own chrome, a
  // selected turn in the rail, and the thread's status colours side by side.
  test("open editor", async ({ page }) => {
    await useTheme(page, theme);
    await installBaselineApi(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page.getByRole("button", { name: "Edit query" }).click();
    const editor = page.locator(".workbench-panel");
    await expect(editor).toBeVisible();
    await expect(page.getByRole("textbox", { name: "SQL query" })).toBeVisible();
    await expect(editor).toHaveScreenshot(`editor-${theme}.png`, shot);
  });

  test("query evidence and Advanced preview", async ({ page }) => {
    await useTheme(page, theme);
    await installBaselineApi(page);
    await page.setViewportSize({ width: 1280, height: 1800 });
    await page.goto("/");
    await page.getByText("View options", { exact: true }).click();
    await page.getByText("Advanced mode", { exact: true }).click();
    await expect(page.getByRole("switch", { name: "Advanced mode" })).toBeChecked();
    await page.keyboard.press("Escape");
    const turn = page.locator("#turn-1");
    await expect(turn.locator(".query-turn__preview")).toBeVisible();
    await turn.getByText("View query details", { exact: true }).click();
    await expect(turn.locator(".query-turn__sql")).toBeVisible();
    await expect(turn).toHaveScreenshot(`query-evidence-${theme}.png`, shot);
  });

  test("thread statuses side by side", async ({ page }) => {
    await useTheme(page, theme);
    await installBaselineApi(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    // All outcomes remain visible without expanding query evidence.
    const timeline = page.locator(".turn-notebook__timeline");
    await expect(timeline).toBeVisible();
    await expect(timeline).toHaveScreenshot(`thread-statuses-${theme}.png`, shot);
  });

  for (const width of [640, 390, 320]) {
    test(`conversation at ${width}px`, async ({ page }) => {
      await useTheme(page, theme);
      await installBaselineApi(page);
      await page.setViewportSize({ width, height: 720 });
      await page.goto("/");
      await expect(page.locator("#turn-1 .query-turn__question")).toBeVisible();
      expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
      await expect(page).toHaveScreenshot(`conversation-${width}-${theme}.png`, { ...shot, fullPage: true });
    });
  }
});
}
