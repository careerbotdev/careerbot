import { expect, type Locator, type Page } from "@playwright/test";

// The widths every critical screen is checked at: phones (320, 390), medium (800), the large breakpoint where the
// third pane first fits (1280), and a wide desktop (1440). Heights are each device's usual one.
export const WIDTHS = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 800, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
// Storybook's default view (what opening a story shows): light and dark side by side when the story fits in half the
// window, light above dark when it doesn't.
export type View = Theme | "both";
export const PHONE = 768;

// Opens one story on its own (no Storybook chrome) at a width and theme (or both), and waits until it has rendered in
// its own type (the fallback font is narrower, so a check before Inter loads would measure a different layout).
// Errors the page throws while it runs fail the check.
export async function openStory(page: Page, id: string, size: { width: number; height: number }, theme: View) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize(size);
  await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`);
  await expect(page.locator("body")).toHaveClass(/sb-show-main/);
  await expect(page.locator("#storybook-root > *").first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "dark" ? "dark" : "light");
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

// Every control the person can see sits inside the viewport's sides, no pane around a control scrolls sideways (a
// pane that scrolls down also scrolls sideways when its rows are too wide, which would hide their ends without moving
// the page), and the page itself doesn't scroll sideways. Anything hidden, empty or marked aria-hidden/inert isn't a
// control the person can see.
export async function expectNothingPastTheEdge(page: Page) {
  const past = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const controls = "button, a[href], input, select, textarea, [role=button], [role=tab], [role=radio], [role=checkbox], [role=switch], [role=menuitem], [tabindex]:not([tabindex='-1'])";
    const sideways = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const x = getComputedStyle(p).overflowX;
        if ((x === "auto" || x === "scroll") && p.scrollWidth > p.clientWidth + 1) return p;
      }
      return null;
    };
    const name = (el: Element) =>
      `<${el.tagName.toLowerCase()}${el.getAttribute("role") ? ` role=${el.getAttribute("role")}` : ""}> ${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}`;
    const out: string[] = [];
    const panes = new Set<Element>();
    for (const el of document.querySelectorAll(controls)) {
      if (el.closest("[aria-hidden='true'], [inert]")) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > width + 1 || r.left < -1) out.push(`${name(el)} spans ${Math.round(r.left)}–${Math.round(r.right)} of ${width}`);
      const pane = sideways(el);
      if (pane && !panes.has(pane)) {
        panes.add(pane);
        out.push(`${name(el)} is in a pane that scrolls sideways: ${pane.scrollWidth} wide in ${pane.clientWidth}`);
      }
    }
    if (document.documentElement.scrollWidth > width + 1) out.push(`the page scrolls sideways: ${document.documentElement.scrollWidth} wide in ${width}`);
    return out;
  });
  expect(past, "controls past the viewport's edge").toEqual([]);
}

// Tab, from the top of the page, reaches the control within `max` presses.
export async function expectTabReaches(page: Page, target: Locator, max = 150) {
  await expect(target).toBeVisible();
  const handle = await target.elementHandle();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await handle!.evaluate((el) => el === document.activeElement || el.contains(document.activeElement))) return;
  }
  throw new Error(`Tab didn't reach the control in ${max} presses`);
}

// The control is inside the viewport, whole (scrolled to first, as a person would).
export async function expectInViewport(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  const view = page.viewportSize()!;
  expect(box, "the control has a box").not.toBeNull();
  expect(box!.x, "left edge inside the viewport").toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, "right edge inside the viewport").toBeLessThanOrEqual(view.width + 1);
  expect(box!.y, "top inside the viewport").toBeGreaterThanOrEqual(-1);
  expect(box!.y + box!.height, "bottom inside the viewport").toBeLessThanOrEqual(view.height + 1);
}
