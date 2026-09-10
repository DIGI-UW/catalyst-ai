import { expect, type Page } from "@playwright/test";

export const openComposer = async (page: Page): Promise<void> => {
  await expect(
    page.getByRole("textbox", { name: "Ask a follow-up" }),
  ).toBeVisible();
};
