import { expect, test } from "@playwright/test";
import { expectInViewport, expectNothingPastTheEdge, expectTabReaches, openStory, PHONE, THEMES, WIDTHS } from "./helpers";

// The critical paths, from the built Storybook, at every width in light and dark: each screen renders without errors,
// no control reaches past the viewport's edge, the key action is reachable with Tab, and the key action works.
// Controls are found by role, label and data-tour, never by the fixtures' words, so fixture data can change freely.
// Each screen is also opened in Storybook's default view (light and dark together), which lays the story out on its
// own, and has to stay inside the viewport there too.

const SCREENS = [
  "screens-today--lines",
  "screens-today--in-the-demo",
  "screens-demo--entry",
  "screens-demo--busy",
  "screens-getting-started--setup-in-progress",
  "screens-getting-started--outreach-path",
  "screens-getting-started--apply-path",
  "screens-getting-started--apply-too",
  "screens-getting-started--outreach-too",
  "screens-getting-started--all-done",
  "screens-review--waiting",
  "screens-companies--target",
  "screens-pursuits--role",
  "screens-pursuits--role-menu",
  "screens-pursuits--not-for-me",
  "screens-pursuits--filters",
  "screens-pursuits--list-menu",
  "screens-pursuits--pursuit",
  "screens-pursuits--choose-path",
  "screens-pursuits--contacted",
  "screens-pursuits--outreach-follow-up",
  "screens-pursuits--next-contact",
  "screens-pursuits--no-open-role",
  "screens-pursuits--pursuit-role",
  "screens-pursuits--no-open-role-role",
  "screens-pursuits--people",
  "screens-pursuits--add-contact",
  "screens-pursuits--answers-and-ask",
  "screens-pursuits--closed",
  "screens-pursuits--by-direction",
  "screens-pursuits--no-directions",
  "screens-resumes--base",
  "screens-reports--outcomes-all-time",
  "screens-website--large",
  "screens-how-it-works--large",
  "screens-open-source--large",
  "screens-questions--large",
  "screens-privacy--privacy",
] as const;

// Getting started at each stage, and the words on the step's main action (a button, or a link that does the step
// elsewhere).
const STAGES = [
  ["screens-getting-started--key-and-budget", "button", "Save and continue"],
  ["screens-getting-started--first-story", "button", /^Done, read it/],
  ["screens-getting-started--setup-in-progress", "button", "Save and continue"],
  ["screens-getting-started--drive", "button", "Connect Google Drive"],
  ["screens-getting-started--pursuit-starting", "link", "Open Pursuits"],
  ["screens-getting-started--choosing-path", "link", "Open the pursuit"],
  ["screens-getting-started--outreach-path", "link", "Open People"],
  ["screens-getting-started--apply-path", "link", "Open the posting"],
  ["screens-getting-started--outreach-sent", "link", "Open the follow-up"],
  ["screens-getting-started--applied", "link", "Open the follow-up"],
  ["screens-getting-started--all-done", "button", "Show Today"],
] as const;

// The website's other pages, each with its own form at the end, and the words on its button.
const PAGES = [
  ["screens-how-it-works--large", "Get notified"],
  ["screens-open-source--large", "Get notified"],
  ["screens-questions--large", "Get notified"],
] as const;

for (const size of WIDTHS) {
  const phone = size.width < PHONE;
  test.describe(`${size.width}px, both`, () => {
    for (const id of SCREENS)
      test(`${id}: nothing past the edge`, async ({ page }) => {
        const errors = await openStory(page, id, size, "both");
        await expectNothingPastTheEdge(page);
        expect(errors).toEqual([]);
      });
  });
  for (const theme of THEMES) {
    test.describe(`${size.width}px, ${theme}`, () => {
      test("Today: a line opens beside or in place of the list", async ({ page }) => {
        const errors = await openStory(page, "screens-today--lines", size, theme);
        const list = page.getByRole("list", { name: "Today" });
        await expect(list).toBeVisible();
        await expectNothingPastTheEdge(page);
        // The Review line's action: Review.
        await expectTabReaches(page, list.getByRole("button", { name: "Review", exact: true }));
        // Focus shows the button's tooltip, which can cover the next line; moving on hides it.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.locator("[data-tour='today.pursuits'] [data-row]").first().click();
        await expect(page.locator("[data-tour='today.item']")).toBeVisible();
        await expectNothingPastTheEdge(page);
        expect(errors).toEqual([]);
      });

      for (const [id, role, name] of STAGES)
        test(`${id}: the step to do opens, and its main action can be reached with Tab`, async ({ page }) => {
          const errors = await openStory(page, id, size, theme);
          await expectNothingPastTheEdge(page);
          const list = page.getByRole("list", { name: "Getting started" });
          await expect(list).toBeVisible();
          // On a phone the list shows alone, the step to do marked; Enter on it opens it in place of the list.
          const current = list.locator("[data-row][aria-current='true']");
          if (phone && (await current.count())) {
            await expectTabReaches(page, current);
            await page.keyboard.press("Enter");
            await expect(page.getByRole("button", { name: /^Back to / })).toBeVisible();
            await expectNothingPastTheEdge(page);
          }
          const action = page.getByRole(role, { name }).last();
          await expectTabReaches(page, action);
          await expectInViewport(page, action);
          expect(errors).toEqual([]);
        });

      test("Getting started: Setup folds to one row once it's done, and opens again", async ({ page }) => {
        const errors = await openStory(page, "screens-getting-started--pursuit-starting", size, theme);
        const list = page.getByRole("list", { name: "Getting started" });
        const rows = list.locator("[data-row]");
        const folded = await rows.count();
        // The list's rows take focus one at a time (Tab reaches the list; arrows move between rows): from the step to
        // do, up to Setup, then Enter opens it.
        await expectTabReaches(page, list.locator("[data-row][aria-current='true']"));
        await page.keyboard.press("Home");
        await expect(rows.first()).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(rows).toHaveCount(folded + 9);
        await expectNothingPastTheEdge(page);
        await page.keyboard.press("Enter");
        await expect(rows).toHaveCount(folded);
        expect(errors).toEqual([]);
      });

      test("Review, cards: a group opens its first card", async ({ page }) => {
        const errors = await openStory(page, "screens-review--waiting", size, theme);
        await page.locator("[data-tour='review.groups'] [data-row]").first().click();
        const card = page.locator("[data-tour='review.card']");
        await expect(card).toBeVisible();
        await expectNothingPastTheEdge(page);
        // The decision: on a phone in the bottom bar, beside the list on the card.
        await expectTabReaches(page, (phone ? page : card).getByRole("button", { name: /^Approve/ }).first());
        expect(errors).toEqual([]);
      });

      test("Review, list: opening a row shows that item", async ({ page }) => {
        const errors = await openStory(page, "screens-review--waiting", size, theme);
        await page.getByRole("radio", { name: "List" }).click();
        await page.locator("[data-tour='review.groups'] [data-row]").first().click();
        const rows = page.locator("[data-row]:not([data-tour='review.groups'] [data-row])");
        await expectTabReaches(page, rows.first());
        await expectNothingPastTheEdge(page);
        await rows.first().click();
        await expect(page.locator("[data-tour='review.card']")).toBeVisible();
        await expectNothingPastTheEdge(page);
        expect(errors).toEqual([]);
      });

      test("Companies: every rating of the open company can be reached", async ({ page }) => {
        const errors = await openStory(page, "screens-companies--target", size, theme);
        await expectNothingPastTheEdge(page);
        if (phone) {
          // The phone's bottom bar: More, Not for me and Target on it, whole and inside the viewport; Maybe on it too, or
          // (narrower than 390) in More, which holds every rating.
          const more = page.getByRole("button", { name: /^More for / }).last();
          const target = page.getByRole("button", { name: /^Target/ }).last();
          await expectInViewport(page, more);
          await expectInViewport(page, page.getByRole("button", { name: /^Not for me/ }).last());
          await expectInViewport(page, target);
          await expectTabReaches(page, target);
          const maybe = page.getByRole("button", { name: /^Maybe/ }).last();
          if (await maybe.isVisible()) await expectInViewport(page, maybe);
          else {
            await more.click();
            await expect(page.getByRole("menuitemcheckbox", { name: /^Maybe/ })).toBeVisible();
            await page.keyboard.press("Escape");
          }
        } else {
          const ratings = page.getByRole("group", { name: /^Your rating of / });
          await expect(ratings.getByRole("button")).toHaveCount(3);
          for (const button of await ratings.getByRole("button").all()) await expectInViewport(page, button);
          await expectTabReaches(page, ratings.getByRole("button").first());
        }
        expect(errors).toEqual([]);
      });

      test("Resumes: a line opens for editing in place", async ({ page }) => {
        const errors = await openStory(page, "screens-resumes--base", size, theme);
        await expectNothingPastTheEdge(page);
        const line = page.getByRole("button", { name: /^Edit: / }).first();
        await expectTabReaches(page, line);
        await page.keyboard.press("Enter");
        const editor = page.getByRole("textbox", { name: "This line" });
        await expect(editor).toBeVisible();
        await expectInViewport(page, editor);
        await expectNothingPastTheEdge(page);
        expect(errors).toEqual([]);
      });

      // From medium up a line's Built on opens a panel under its chip, which shows only on hover or focus. Moving the
      // pointer off the line into the panel, and Tab inside it, keep the chip there and the panel under it (a hidden
      // chip once left the panel in the top-left corner). On a phone it opens as a sheet.
      if (!phone)
        test("Resumes: a line's Built on stays under its chip while the pointer moves into it", async ({ page }) => {
          const errors = await openStory(page, "screens-resumes--base", size, theme);
          // The chip is hidden at rest, so the line is found by it before it's in the accessibility tree.
          const line = page.locator("li:has(button[aria-label^='Built on'])").first();
          await line.scrollIntoViewIfNeeded();
          await line.hover({ position: { x: 4, y: 4 } });
          const chip = line.getByRole("button", { name: /^Built on \d+: show sources$/ });
          await chip.click();
          const panel = page.getByRole("dialog", { name: /^Built on \d+$/ });
          await expect(panel).toBeVisible();
          const opened = (await panel.boundingBox())!;
          const at = (await chip.boundingBox())!;
          expect(opened.y, "the panel opens under its chip").toBeGreaterThanOrEqual(at.y + at.height);
          await page.mouse.move(opened.x + opened.width / 2, opened.y + opened.height / 2, { steps: 12 });
          await page.keyboard.press("Tab");
          await expect(chip).toBeVisible();
          expect(await panel.boundingBox(), "the panel stays where it opened").toEqual(opened);
          expect(errors).toEqual([]);
        });

      test("Website: every waitlist form can be reached with Tab", async ({ page }) => {
        const errors = await openStory(page, "screens-website--large", size, theme);
        await expectNothingPastTheEdge(page);
        // The hero's and the closing's forms, and the band's form from medium up (on a phone the band's button leads
        // to the hero's form instead).
        const fields = page.getByRole("textbox", { name: "Email" });
        const buttons = page.getByRole("button", { name: "Get notified", exact: true });
        await expect(fields).toHaveCount(phone ? 2 : 3);
        for (let i = 0; i < (await fields.count()); i++) await expectTabReaches(page, fields.nth(i));
        for (let i = 0; i < (await buttons.count()); i++) await expectTabReaches(page, buttons.nth(i));
        expect(errors).toEqual([]);
      });

      test("Demo: Open the demo can be reached with Tab", async ({ page }) => {
        const errors = await openStory(page, "screens-demo--entry", size, theme);
        await expectNothingPastTheEdge(page);
        const open = page.getByRole("button", { name: "Open the demo", exact: true });
        await expectTabReaches(page, open);
        await expectInViewport(page, open);
        expect(errors).toEqual([]);
      });

      for (const [id, cta] of PAGES)
        test(`${id}: its form can be reached with Tab`, async ({ page }) => {
          const errors = await openStory(page, id, size, theme);
          await expectNothingPastTheEdge(page);
          const field = page.getByRole("textbox", { name: "Email" });
          await expect(field).toHaveCount(1);
          await expectTabReaches(page, field, 400);
          await expectTabReaches(page, page.locator("form").getByRole("button", { name: cta, exact: true }), 400);
          expect(errors).toEqual([]);
        });
    });
  }
}
