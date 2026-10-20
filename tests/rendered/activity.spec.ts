import { expect, test } from "@playwright/test";
import { openStory } from "./helpers";

// The Activity panel opens upward from the foot of the sidebar. With a long list it grew past the window's top, taking
// its header (Clear finished) and the first items out of reach. It's now as tall as the room above the indicator at most,
// its header and spending stay put, and the list scrolls between them with the wheel.

for (const size of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
])
  test(`a long Activity list fits the window and scrolls at ${size.width}×${size.height}`, async ({ page }) => {
    const errors = await openStory(page, "patterns-activity--a-long-list", size, "light");
    const panel = page.getByRole("dialog", { name: "Activity" });
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.y, "the panel's top is inside the window").toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, "the panel's bottom is inside the window").toBeLessThanOrEqual(size.height);

    const clear = panel.getByRole("button", { name: "Clear finished" });
    const clearBox = (await clear.boundingBox())!;
    expect(clearBox.y, "Clear finished is inside the window").toBeGreaterThanOrEqual(0);

    const first = panel.getByText("Checking roles at company 1");
    const last = panel.getByText("Found companies, batch 35");
    const scroller = first.locator("xpath=ancestor::*[contains(@class,'overflow-y-auto')][1]");
    await expect(scroller).toHaveCount(1);
    expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

    const firstBox = (await first.boundingBox())!;
    await page.mouse.move(firstBox.x + 20, firstBox.y + firstBox.height / 2);
    await page.mouse.wheel(0, 5000);
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect.poll(async () => (await last.boundingBox())!.y + 20).toBeLessThanOrEqual(box.y + box.height);
    // The header stayed where it was while the list scrolled.
    expect((await clear.boundingBox())!.y).toBe(clearBox.y);
    expect(errors).toEqual([]);
  });
