import { expect, test } from "@playwright/test";
import { expectNothingPastTheEdge, openStory, THEMES } from "./helpers";

// The docs, from the built Storybook (Screens/Docs). The home, a guide and How the AI works render without errors and
// keep everything inside the viewport from 320 to 1440, in light and dark; search opens (⌘K, the sidebar's field on a
// large screen, the docs bar's button on a phone) and returns pages for a question; the phone's contents sheet opens
// from the docs bar with the page tree, and choosing a page closes it; Previous and Next lead to the pages around it.

const DOCS_WIDTHS = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 800, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;
const STORIES = ["screens-docs--home", "screens-docs--guide", "screens-docs--how-the-ai-works"] as const;
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const GUIDE = "screens-docs--guide";

for (const size of DOCS_WIDTHS)
  for (const theme of THEMES)
    test.describe(`docs, ${size.width}px, ${theme}`, () => {
      for (const id of STORIES)
        test(`${id}: renders, nothing past the edge`, async ({ page }) => {
          const errors = await openStory(page, id, size, theme);
          await expectNothingPastTheEdge(page);
          expect(errors).toEqual([]);
        });
    });

test.describe("the docs", () => {
  for (const theme of THEMES)
    test(`search opens with ⌘K and returns pages, ${theme}`, async ({ page }) => {
      const errors = await openStory(page, GUIDE, DESKTOP, theme);
      await page.keyboard.press("ControlOrMeta+k");
      const field = page.getByRole("combobox");
      await expect(field).toBeFocused();
      await field.fill("what does the AI read");
      await expect(page.getByRole("option").first()).toBeVisible();
      await expectNothingPastTheEdge(page);
      await page.keyboard.press("Escape");
      await expect(field).toBeHidden();
      expect(errors).toEqual([]);
    });

  test("search opens from the sidebar's field and offers the main pages before anything is typed", async ({ page }) => {
    const errors = await openStory(page, GUIDE, DESKTOP, "light");
    await page.getByRole("complementary").getByRole("button", { name: "Search docs" }).click();
    await expect(page.getByRole("option", { name: /First steps/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  for (const theme of THEMES)
    test(`on a phone, search opens from the docs bar and returns pages, ${theme}`, async ({ page }) => {
      const errors = await openStory(page, GUIDE, PHONE, theme);
      await page.getByRole("button", { name: "Search docs" }).click();
      const field = page.getByRole("combobox");
      await field.fill("setup code");
      await expect(page.getByRole("option").first()).toBeVisible();
      await expectNothingPastTheEdge(page);
      expect(errors).toEqual([]);
    });

  for (const theme of THEMES)
    test(`on a phone, the contents sheet opens with the page tree and closes when a page is chosen, ${theme}`, async ({ page }) => {
      const errors = await openStory(page, GUIDE, PHONE, theme);
      await page.getByRole("button", { name: /Best practices/ }).click();
      const sheet = page.getByRole("dialog", { name: "Docs" });
      await expect(sheet).toBeVisible();
      const tree = sheet.getByRole("navigation", { name: "Docs" });
      await expect(tree.getByRole("link", { name: "Your story" })).toBeVisible();
      await expectNothingPastTheEdge(page);
      await tree.getByRole("link", { name: "Your story" }).click();
      await expect(sheet).toBeHidden();
      expect(errors).toEqual([]);
    });

  test("Previous and Next lead to the pages either side of it", async ({ page }) => {
    await openStory(page, GUIDE, DESKTOP, "light");
    const around = page.getByRole("navigation", { name: "Previous and next" });
    await expect(around.getByRole("link", { name: /^Previous/ })).toHaveAttribute("href", /^\/docs\/.+/);
    await expect(around.getByRole("link", { name: /^Next/ })).toHaveAttribute("href", "/docs/best-practices/goals");
  });
});
