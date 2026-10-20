import { expect, test } from "@playwright/test";
import { expectNothingPastTheEdge, openStory, PHONE, WIDTHS } from "./helpers";

// Search settings (cb-e5a.79): Companies ⋯ > Search settings opens one dialog (full screen with Back on a phone) whose
// controls save: a company found by name and added joins Companies you like (Find runs only when pressed), a typed
// website is added with no search, Remove takes one off, and Learn from your ratings flips. Settings, Connections keeps Job postings from Apollo saving.

for (const size of WIDTHS)
  test(`${size.width}px: Search settings opens from Companies ⋯ and Companies you like and switches save`, async ({ page }) => {
    const errors = await openStory(page, "screens-companies--found-list", size, "light");
    await page.getByRole("button", { name: "More for Companies" }).first().click();
    await page.getByRole(size.width >= PHONE ? "menuitem" : "button", { name: /^Search settings/ }).click();
    if (size.width < PHONE) await expect(page.getByRole("button", { name: /Companies/ }).first()).toBeVisible();
    else await expect(page.getByRole("dialog", { name: "Search settings" })).toBeVisible();

    const likes = page.getByRole("list", { name: "Companies you like" });
    const box = page.getByRole("textbox", { name: "Add a company you like" });
    await box.fill("Kestrel");
    await expect(page.getByText("1 Apollo credit").first()).toBeVisible();
    await expect(page.getByLabel("Companies found")).toHaveCount(0);
    await box.press("Enter");
    const found = page.getByLabel("Companies found");
    await expect(found.getByText("Kestrel Freight")).toBeVisible();
    await found.getByRole("button", { name: "Add" }).first().click();
    await expect(likes.getByText("Kestrel Freight")).toBeVisible();
    await box.fill("acme.example.com");
    await box.press("Enter");
    await expect(likes.getByText("acme.example.com")).toBeVisible();
    await likes.getByRole("button", { name: "Remove acme.example.com" }).click();
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
