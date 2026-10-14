import { expect, test } from "@playwright/test";
import { expectNothingPastTheEdge, openStory, PHONE, WIDTHS } from "./helpers";

// Pursuits sorted by Newest posted: the list's ⋯ has Sort by (a submenu on medium screens and up, the sheet on
// phones) with Best fit and Newest posted, each explained; once sorted, a Sort chip in the filter bar says so and its ×
// puts Best fit back, and every row says when it was posted, newest first (No posted date, last, for roles that don't
// say).

for (const size of WIDTHS)
  test(`${size.width}px: Sort by lists Best fit and Newest posted; sorted, the chip shows and rows say when they were posted`, async ({ page }) => {
    const errors = await openStory(page, "screens-pursuits--sorted-by-posted", size, "light");
    const chip = page.getByRole("button", { name: "Sort: Newest posted" });
    await expect(chip).toBeVisible();
    const rows = page.getByRole("list", { name: "Roles" }).locator("[data-row]");
    await expect(rows.first()).toBeVisible();
    const metas = await rows.allInnerTexts();
    expect(metas.length).toBeGreaterThan(1);
    for (const m of metas) expect(m, "a row sorted by posted doesn't say when it was posted").toMatch(/Posted|New today|No posted date/);
    // Roles that don't say when they were posted come last, and say so.
    const undated = metas.findIndex((m) => m.includes("No posted date"));
    expect(undated, "no role without a posted date is listed").toBeGreaterThan(0);
    for (const m of metas.slice(undated)) expect(m).toContain("No posted date");
    await expectNothingPastTheEdge(page);

    await page.getByRole("button", { name: "More for Pursuits" }).first().click();
    await page.getByRole(size.width >= PHONE ? "menuitem" : "button", { name: /^Sort by/ }).click();
    const newest = page.getByRole(size.width >= PHONE ? "menuitemcheckbox" : "menuitemcheckbox", { name: /Newest posted/ });
    await expect(newest).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("menuitemcheckbox", { name: /Best fit/ })).toHaveAttribute("aria-checked", "false");
    await page.getByRole("menuitemcheckbox", { name: /Best fit/ }).click();
    await expect(chip).toHaveCount(0);
    expect(errors).toEqual([]);
  });
