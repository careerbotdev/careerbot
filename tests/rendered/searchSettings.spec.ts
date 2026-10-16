import { expect, test } from "@playwright/test";
import { expectNothingPastTheEdge, openStory, PHONE, WIDTHS } from "./helpers";

// Search settings (cb-e5a.79): Companies ⋯ > Search settings opens one dialog (full screen with Back on a phone) whose
// controls save to the same lists and switches as before: a seed added or removed changes the seed list, Learn from
// your ratings flips. Settings, Connections keeps Job postings from Apollo saving.

for (const size of WIDTHS)
  test(`${size.width}px: Search settings opens from Companies ⋯ and its seed list and switches save`, async ({ page }) => {
    const errors = await openStory(page, "screens-companies--found-list", size, "light");
    await page.getByRole("button", { name: "More for Companies" }).first().click();
    await page.getByRole(size.width >= PHONE ? "menuitem" : "button", { name: /^Search settings/ }).click();
    if (size.width < PHONE) await expect(page.getByRole("button", { name: /Companies/ }).first()).toBeVisible();
    else await expect(page.getByRole("dialog", { name: "Search settings" })).toBeVisible();

    const seeds = page.getByRole("list", { name: "Seed companies" });
    await page.getByRole("textbox", { name: "Add to Seed companies" }).fill("acme.com");
    await page.getByRole("textbox", { name: "Add to Seed companies" }).press("Enter");
    await expect(seeds.getByText("acme.com")).toBeVisible();
    await seeds.getByRole("button", { name: "Remove acme.com" }).click();
    await expect(seeds.getByText("acme.com")).toHaveCount(0);

    const learn = page.getByRole("switch", { name: "Learn from your ratings" });
    await expect(learn).toHaveAttribute("aria-checked", "true");
    await learn.click();
    await expect(learn).toHaveAttribute("aria-checked", "false");
    await expectNothingPastTheEdge(page);
    expect(errors).toEqual([]);
  });

test("Settings, Connections: Job postings from Apollo still saves", async ({ page }) => {
  const errors = await openStory(page, "screens-settings--connections", WIDTHS[WIDTHS.length - 1], "light");
  const jobs = page.getByRole("switch", { name: "Job postings from Apollo" });
  await expect(jobs).toHaveAttribute("aria-checked", "true");
  await jobs.click();
  await expect(jobs).toHaveAttribute("aria-checked", "false");
  expect(errors).toEqual([]);
});
