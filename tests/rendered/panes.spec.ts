import { expect, type Page, test } from "@playwright/test";
import { openStory } from "./helpers";

// Pane widths, from the built Storybook on a wide desktop: a width the person sets with a divider is one setting for the
// whole app, so it holds on every screen, after a reload, inside each screen's own limits (Panes.tsx, PANE_SIZES).

const DESKTOP = { width: 1440, height: 900 };

async function width(page: Page, pane: string) {
  return page.locator(`[data-panel][id="${pane}"]`).evaluate((el) => Math.round(el.getBoundingClientRect().width));
}

async function open(page: Page, id: string) {
  await openStory(page, id, DESKTOP, "light");
  await expect(page.getByRole("separator").first()).toBeVisible();
}

test("a list width set on one screen holds on the others and after a reload, inside each screen's limits", async ({ page }) => {
  await open(page, "screens-pursuits--role");
  const before = await width(page, "list");
  await page.getByRole("separator", { name: "Resize the list" }).focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await expect.poll(() => width(page, "list")).toBeGreaterThan(before);
  const set = await width(page, "list");

  await open(page, "screens-companies--found");
  await expect.poll(() => width(page, "list")).toBe(set);

  await page.reload();
  await expect(page.getByRole("separator").first()).toBeVisible();
  await expect.poll(() => width(page, "list")).toBe(set);

  // Today's list is the screen's main reading, 480 to 600 wide.
  await open(page, "screens-today--lines");
  await expect.poll(() => width(page, "list")).toBe(Math.min(600, Math.max(480, set)));

  await open(page, "screens-pursuits--role");
  await expect.poll(() => width(page, "list")).toBe(set);
});

test("the third pane's width holds, and moving its divider leaves the list's width as set", async ({ page }) => {
  await open(page, "screens-pursuits--role");
  await page.getByRole("separator", { name: "Resize the list" }).focus();
  await page.keyboard.press("ArrowLeft");
  const list = await width(page, "list");

  await open(page, "patterns-panes--with-a-third-pane");
  const before = await width(page, "third");
  await page.getByRole("separator", { name: "Resize Tailored resume" }).focus();
  for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowLeft");
  await expect.poll(() => width(page, "third")).toBeGreaterThan(before);
  const third = await width(page, "third");

  await open(page, "patterns-panes--with-a-third-pane");
  await expect.poll(() => width(page, "third")).toBe(third);
  await open(page, "screens-pursuits--role");
  await expect.poll(() => width(page, "list")).toBe(list);
});
