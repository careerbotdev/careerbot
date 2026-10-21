import { expect, test } from "@playwright/test";
import { expectNothingPastTheEdge, openStory, PHONE, WIDTHS } from "./helpers";

// Search settings (cb-e5a.79): Companies ⋯ > Search settings opens one dialog (full screen with Back on a phone) whose
// controls save: a company chosen from the free suggestions as a name is typed joins Companies you like, a typed website
// is added with no search, a row's ⋯ removes one, and Learn from your ratings flips. Settings, Connections keeps Job
// postings from Apollo saving.

for (const size of WIDTHS)
  test(`${size.width}px: Search settings opens from Companies ⋯ and Companies you like and switches save`, async ({ page }) => {
    const errors = await openStory(page, "screens-companies--found-list", size, "light");
    await page.getByRole("button", { name: "More for Companies" }).first().click();
    await page.getByRole(size.width >= PHONE ? "menuitem" : "button", { name: /^Search settings/ }).click();
    if (size.width < PHONE) await expect(page.getByRole("button", { name: /Companies/ }).first()).toBeVisible();
    else await expect(page.getByRole("dialog", { name: "Search settings" })).toBeVisible();

    const likes = page.getByRole("list", { name: "Companies you like" });
    const box = page.getByRole("combobox", { name: "Add a company you like" });
    // The dialog opens on the search box (not on a phone, where it would raise the keyboard).
    if (size.width >= PHONE) await expect(box).toBeFocused();
    // Typed at once (with less motion the dialog is up before the menu that opened it has finished closing), the box
    // keeps focus and its suggestions stay open.
    await box.click();
    await box.pressSequentially("Kestrel");
    await expect(page.getByRole("option", { name: /Kestrel Freight/ })).toBeVisible();
    await expect(box).toBeFocused();
    await expect(page.getByRole("button", { name: "Find", exact: true })).toHaveCount(0);
    await page.getByRole("option", { name: /Kestrel Freight/ }).click();
    await expect(likes.getByText("Kestrel Freight")).toBeVisible();
    await box.fill("acme.example.com");
    await box.press("Enter");
    await expect(likes.getByText("acme.example.com")).toBeVisible();
    await likes.getByRole("button", { name: "More for acme.example.com" }).click();
    await page.getByRole(size.width >= PHONE ? "menuitem" : "button", { name: /^Remove/ }).click();
    await expect(likes.getByText("acme.example.com")).toHaveCount(0);

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
