import { expect, test } from "@playwright/test";
import { expectDisplayedWarehouse } from "./support/pipeline-proof";

// The pinned controller renders the root as a direct text node alongside a
// label and button. This guards the browser assertion, not pipeline execution.
const root = "/dwh/catalyst_DWH_TIMESTAMP_2026_09_08T03_31_09Z";
const banner = (value: string) => `
  <div class="alert alert-info">
    <b>Latest:</b> ${value}
    <div><button>Create Resource Tables</button></div>
  </div>`;

test("reads the complete warehouse root from the controller banner", async ({
  page,
}) => {
  await page.setContent(banner(root));
  await expectDisplayedWarehouse(page, root);
});

test("rejects a stale banner even when the requested root appears elsewhere", async ({
  page,
}) => {
  await page.setContent(`${banner(`${root}_old`)}<p>${root}</p>`);
  await expect(expectDisplayedWarehouse(page, root)).rejects.toThrow();
});
