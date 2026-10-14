import { expect, test } from "@playwright/test";
import { openStory } from "./helpers";

// The wheel scrolls whatever is under the pointer. An element with overflow hidden (a rounded image, a row cut short)
// is a scroll container too, so overscroll-behavior none on it swallowed the wheel instead of passing it to the pane or
// page around it (globals.css): over a row of Pursuits, or a screenshot in the docs, nothing moved.

const DESKTOP = { width: 1440, height: 900 };

test("the wheel over a row scrolls the list it's in", async ({ page }) => {
  await openStory(page, "screens-pursuits--role", DESKTOP, "light");
  const row = page.getByRole("button", { name: /^Score 91, strong fit Senior Product Manager/ }).first();
  await expect(row).toBeVisible();
  const scroller = row.locator("xpath=ancestor::*[contains(@class,'overflow-y-auto')][1]");
  await expect(scroller).toHaveCount(1);
  expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

for (const id of ["screens-pursuits--role", "screens-docs--guide", "screens-today--lines"])
  test(`${id}: only the page and what scrolls up and down on its own stop the wheel`, async ({ page }) => {
    await openStory(page, id, DESKTOP, "light");
    const stoppers = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((el) => {
          const cs = getComputedStyle(el);
          return cs.overscrollBehaviorY === "none" && !/(auto|scroll)/.test(cs.overflowY);
        })
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)}`),
    );
    expect(stoppers).toEqual([]);
  });
