import { expect, type Page, test } from "@playwright/test";
import { expectInViewport, expectNothingPastTheEdge, expectTabReaches, openStory, THEMES, WIDTHS } from "./helpers";

// The website's pages and parts and the sign-in page, from the built Storybook. Each mock-up plays without errors and
// stays inside a phone's width, and with reduced motion (the system setting, or MotionConfig in its Reduced motion
// story) it shows exactly its final frame: nothing moves and nothing is left half drawn. Each of the site's parts and
// pages renders without errors and stays inside the viewport at every width, in light and dark. On the pages: the page
// you're on is marked in the header (in the bar on a large screen, in the menu on a phone); a link between public
// pages loads a new document (the analytics count document loads only); an old section address opens the page it moved
// to; the bar's Get notified waits for the hero's form to leave the view on Home and is always there on the other
// pages, taking you to the page's own form; the phone's menu works by keyboard (Home first, Tab stays inside it,
// Escape closes it and returns the focus, the page holds still behind it, it closes when the window grows to a large
// screen); the band's Get notified on a phone takes you to the hero's form; Home's questions fold on a phone; and with
// reduced motion nothing animates anywhere on a page.

const MOCKUPS = ["hero", "sign-in-scene", "door", "pain-void", "pain-resume", "pain-stuck", "why", "story", "roles", "apply", "people", "open", "fan", "portal", "rooted", "steps"] as const;

const PARTS = [
  "site-parts-header--top",
  "site-parts-header--scrolled",
  "site-parts-header--other-page",
  "site-parts-header--menu-open",
  "site-parts-header--menu-open-other-page",
  "site-parts-footer--large",
  "site-parts-waitlist--default",
  "site-parts-waitlist--refused",
  "site-parts-hero--large",
  "site-parts-hero--joined",
  "site-parts-cta-band--large",
  "site-parts-cta-band--joined",
  "site-parts-why--large",
  "site-parts-sections--pains",
  "site-parts-sections--start",
  "site-parts-sections--steps",
  "site-parts-sections--cards",
  "site-parts-sections--questions",
  "site-parts-sections--questions-phone-opened",
  "site-parts-sections--questions-page",
  "site-parts-sections--page-header",
  "site-parts-sections--method",
  "site-parts-sections--paths",
  "site-parts-sections--horizons",
  "site-parts-sections--portal",
  "site-parts-sections--trust",
  "site-parts-sections--features-table",
  "site-parts-sections--licence",
  "site-parts-sections--needs",
  "site-parts-sections--compare",
  "site-parts-sections--closing",
  "site-parts-sections--closing-own",
  "site-parts-sections--closing-joined",
  "site-parts-prose--page",
] as const;

// Each page's story, its address and its name in the header.
const PAGES = [
  ["screens-website--large", "/", "Home"],
  ["screens-how-it-works--large", "/how-it-works", "How it works"],
  ["screens-open-source--large", "/open-source", "Open source"],
  ["screens-questions--large", "/questions", "Questions"],
] as const;

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

// The first mock-up's drawing, once its fonts have loaded and every animation in the page has finished or stopped.
async function drawing(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const stage = page.getByRole("img").first();
  await expect(stage).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
  return stage.screenshot();
}

for (const name of MOCKUPS) {
  test.describe(`mock-up ${name}`, () => {
    test.describe("with motion", () => {
      test.use({ reducedMotion: "no-preference" });
      for (const story of ["playing", "phone"])
        test(`${story}: renders at 390 without errors, nothing past the edge`, async ({ page }) => {
          const errors = await openStory(page, `site-mockups-${name}--${story}`, PHONE, "both");
          await expect(page.getByRole("img").first()).toBeVisible();
          await page.waitForTimeout(1500);
          await expectNothingPastTheEdge(page);
          expect(errors).toEqual([]);
        });

      test("Reduced motion story shows the final frame", async ({ page }) => {
        await openStory(page, `site-mockups-${name}--final-frame`, DESKTOP, "light");
        const still = await drawing(page);
        await openStory(page, `site-mockups-${name}--reduced-motion`, DESKTOP, "light");
        expect(await drawing(page)).toEqual(still);
      });
    });

    test("with the system's reduced motion, Playing shows the final frame", async ({ page }) => {
      await openStory(page, `site-mockups-${name}--final-frame`, DESKTOP, "light");
      const still = await drawing(page);
      await openStory(page, `site-mockups-${name}--playing`, DESKTOP, "light");
      expect(await drawing(page)).toEqual(still);
    });
  });
}

for (const size of WIDTHS)
  for (const theme of THEMES)
    test.describe(`${size.width}px, ${theme}`, () => {
      for (const id of [...PARTS, ...PAGES.map(([story]) => story)])
        test(`${id}: renders, nothing past the edge`, async ({ page }) => {
          const errors = await openStory(page, id, size, theme);
          await expectNothingPastTheEdge(page);
          expect(errors).toEqual([]);
        });

      test("Sign in: Google, GitHub and the waitlist link can be reached with Tab", async ({ page }) => {
        const errors = await openStory(page, "screens-sign-in--sign-in", size, theme);
        await expectNothingPastTheEdge(page);
        for (const name of ["Continue with Google", "Continue with GitHub"]) await expectTabReaches(page, page.getByRole("button", { name }));
        await expect(page.getByRole("link", { name: "Get notified when it opens" })).toHaveAttribute("href", "/#waitlist");
        await expectTabReaches(page, page.getByRole("link", { name: "Get notified when it opens" }));
        expect(errors).toEqual([]);
      });

      test("Sign in, not invited: the waitlist has the account's email and another account can be tried", async ({ page }) => {
        const errors = await openStory(page, "screens-sign-in--not-invited", size, theme);
        await expectNothingPastTheEdge(page);
        const email = page.getByRole("textbox", { name: "Email" });
        await expect(email).toHaveValue("sam.rivera@example.com");
        await expectTabReaches(page, email);
        await expectTabReaches(page, page.getByRole("button", { name: "Get notified" }));
        // Focus shows the button's tooltip, which can cover the line under it; moving on hides it.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.getByRole("button", { name: "Try another account" }).click();
        await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
        expect(errors).toEqual([]);
      });
    });

const siteNav = (page: Page) => page.getByRole("navigation", { name: "Site" });
// The bottom of the sticky bar, where the page starts to show.
async function barBottom(page: Page) {
  const box = (await page.locator("header > nav > div").first().boundingBox())!;
  return Math.round(box.y + box.height);
}
// Whether the page scrolls (the phone's menu holds it still).
const pageLocked = (page: Page) => page.evaluate(() => document.documentElement.style.overflow === "hidden");
// Answers any address on the Storybook server with a blank page, so a link can be followed to it.
async function stubPages(page: Page) {
  await page.route(/\/(how-it-works|open-source|questions|privacy|sign-in)$|\/$/, (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>stub</title><p>stub</p>" }),
  );
}

test.describe("the website's pages", () => {
  test.use({ reducedMotion: "reduce" });

  for (const [story, , name] of PAGES) {
    test(`${name}: marked as the page you're on, in the bar and in the phone's menu`, async ({ page }) => {
      const errors = await openStory(page, story, DESKTOP, "light");
      const marked = siteNav(page).locator("[aria-current=page]").filter({ visible: true });
      await expect(marked).toHaveCount(1);
      await expect(marked).toHaveText(name);
      await expect(marked).toHaveClass(/bg-steel-subtle/);
      await page.setViewportSize(PHONE);
      await siteNav(page).getByRole("button", { name: "Menu" }).click();
      await expect(marked).toHaveCount(1);
      await expect(marked).toHaveText(name);
      await expect(marked).toBeVisible();
      expect(errors).toEqual([]);
    });

    test(`${name}: with reduced motion nothing on the page animates`, async ({ page }) => {
      for (const size of [PHONE, DESKTOP]) {
        const errors = await openStory(page, story, size, "light");
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < height; y += size.height / 2) {
          await page.evaluate((top) => window.scrollTo(0, top), y);
          await page.waitForTimeout(50);
          expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
        }
        expect(errors).toEqual([]);
      }
    });
  }

  test("a link between public pages loads a new document (header, footer and Home's own links)", async ({ page }) => {
    await stubPages(page);
    for (const [where, link] of [
      ["header", (p: Page) => siteNav(p).getByRole("link", { name: "How it works", exact: true })],
      ["footer", (p: Page) => p.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Questions" })],
      ["steps", (p: Page) => p.getByRole("link", { name: "See how it works" })],
      ["privacy", (p: Page) => p.getByRole("link", { name: "Privacy" })],
      ["header sign in", (p: Page) => siteNav(p).getByRole("link", { name: "Sign in" })],
      ["footer sign in", (p: Page) => p.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Sign in" })],
    ] as const) {
      await openStory(page, "screens-website--large", DESKTOP, "light");
      await page.evaluate((mark) => Object.assign(window, { stillHere: mark }), where);
      await link(page).click();
      await expect(page.getByText("stub"), where).toBeVisible();
      expect(await page.evaluate(() => "stillHere" in window), `${where}: a new document`).toBe(false);
    }
  });

  test("the sign-in page's links back to the website load a new document (the wordmark, Get notified when it opens)", async ({ page }) => {
    await stubPages(page);
    for (const [where, link] of [
      ["wordmark", (p: Page) => p.getByRole("link", { name: "CareerBot" }).first()],
      ["waitlist", (p: Page) => p.getByRole("link", { name: "Get notified when it opens" })],
    ] as const) {
      await openStory(page, "screens-sign-in--sign-in", DESKTOP, "light");
      await page.evaluate((mark) => Object.assign(window, { stillHere: mark }), where);
      await link(page).click();
      await expect(page.getByText("stub"), where).toBeVisible();
      expect(await page.evaluate(() => "stillHere" in window), `${where}: a new document`).toBe(false);
    }
  });

  for (const [hash, to] of [
    ["#features", "/how-it-works"],
    ["#open-source", "/open-source"],
    ["#questions", "/questions"],
  ] as const)
    test(`Home opened at ${hash} goes to ${to}`, async ({ page }) => {
      await stubPages(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`/iframe.html?id=screens-website--large&viewMode=story&globals=theme:light${hash}`);
      await page.waitForURL((url) => url.pathname === to);
      await expect(page.getByText("stub")).toBeVisible();
    });

  test("Home: the bar takes its surface once the page moves; Get notified appears once the hero's form is out of view and takes you back to it", async ({ page }) => {
    const errors = await openStory(page, "screens-website--large", DESKTOP, "light");
    const bar = page.locator("header > nav > div").first();
    const notify = siteNav(page).getByRole("button", { name: "Get notified", exact: true });
    await expect(bar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(notify).toHaveCount(0);
    await page.getByRole("heading", { name: "How CareerBot fixes it" }).evaluate((el) => el.scrollIntoView({ block: "start" }));
    await expect(bar).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await notify.click();
    const field = page.getByRole("textbox", { name: "Email" }).first();
    await expect(field).toBeFocused();
    const box = (await field.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(await barBottom(page));
    expect(box.y + box.height).toBeLessThanOrEqual(DESKTOP.height);
    await expect(notify).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  for (const [story, , name] of PAGES.slice(1))
    for (const size of [DESKTOP, PHONE])
      test(`${name} at ${size.width}px: Get notified is always there and takes you to the page's own form`, async ({ page }) => {
        const errors = await openStory(page, story, size, "light");
        if (size === PHONE) await siteNav(page).getByRole("button", { name: "Menu" }).click();
        await siteNav(page).getByRole("button", { name: "Get notified", exact: true }).click();
        const field = page.getByRole("textbox", { name: "Email" });
        await expect(field).toBeFocused();
        await expectInViewport(page, field);
        expect(errors).toEqual([]);
      });
});

// With motion, on a phone: once the page has been scrolled through, no words are left faded out (a part that holds
// still on a phone must show its words, not the first frame of the motion it skipped). On the live site the page learns
// it's on a phone only after it first draws; opening it wide and then narrowing the window takes the same path.
test.describe("the website's pages with motion, on a phone", () => {
  test.use({ reducedMotion: "no-preference" });

  for (const [story, , name] of PAGES)
    test(`${name}: every heading, paragraph and list item can be seen once scrolled through`, async ({ page }) => {
      const errors = await openStory(page, story, DESKTOP, "light");
      await page.setViewportSize(PHONE);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < height; y += PHONE.height / 2) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(3500);
      const faded = await page.evaluate(() => {
        const seen = (el: Element) => {
          let opacity = 1;
          for (let e: Element | null = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
          return opacity;
        };
        return [...document.querySelectorAll("main h1, main h2, main h3, main p, main li")]
          .filter((el) => !el.closest("[aria-hidden='true'], [role='img'], .sr-only") && el.textContent?.trim() && el.getClientRects().length > 0)
          .filter((el) => seen(el) < 0.9)
          .map((el) => (el.textContent ?? "").trim().slice(0, 50));
      });
      expect(faded, "words left faded out").toEqual([]);
      expect(errors).toEqual([]);
    });
});

test.describe("the website's menu on a phone", () => {
  test.use({ reducedMotion: "reduce" });

  test("opens and closes by keyboard, Home first, keeps Tab inside, holds the page still, and Escape returns the focus", async ({ page }) => {
    const errors = await openStory(page, "screens-how-it-works--large", PHONE, "light");
    const button = siteNav(page).getByRole("button", { name: "Menu" });
    await expectTabReaches(page, button);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    const close = siteNav(page).getByRole("button", { name: "Close" });
    await expect(close).toHaveAttribute("aria-expanded", "true");
    const menu = page.locator(`[id="${await close.getAttribute("aria-controls")}"]`);
    await expect(menu).toBeVisible();
    expect(await pageLocked(page)).toBe(true);
    // Tab goes on into the menu's rows and Get notified, then round to the wordmark, and back.
    for (const name of ["Home", "How it works", "Open source", "Questions", "Docs"]) {
      await page.keyboard.press("Tab");
      await expect(menu.getByRole("link", { name, exact: true })).toBeFocused();
    }
    await page.keyboard.press("Tab");
    await expect(menu.getByRole("button", { name: "Get notified", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(siteNav(page).getByRole("link", { name: "CareerBot" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(menu.getByRole("button", { name: "Get notified", exact: true })).toBeFocused();
    // The page behind doesn't scroll.
    await page.mouse.move(200, 700);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    expect(await pageLocked(page)).toBe(false);
    expect(errors).toEqual([]);
  });

  test("Get notified in the menu on Home takes you to the hero's form, cursor in the field", async ({ page }) => {
    const errors = await openStory(page, "screens-website--large", PHONE, "light");
    await page.getByRole("heading", { name: "How CareerBot fixes it" }).evaluate((el) => el.scrollIntoView({ block: "start" }));
    await siteNav(page).getByRole("button", { name: "Menu" }).click();
    await siteNav(page).getByRole("button", { name: "Get notified", exact: true }).click();
    const field = page.getByRole("textbox", { name: "Email" }).first();
    await expect(field).toBeFocused();
    const box = (await field.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(await barBottom(page));
    expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height);
    await expect(siteNav(page).getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
    expect(errors).toEqual([]);
  });

  test("closes when the window grows to a large screen", async ({ page }) => {
    const errors = await openStory(page, "screens-website--large", PHONE, "light");
    await siteNav(page).getByRole("button", { name: "Menu" }).click();
    expect(await pageLocked(page)).toBe(true);
    await page.setViewportSize(DESKTOP);
    await expect.poll(() => pageLocked(page)).toBe(false);
    await page.setViewportSize(PHONE);
    await expect(siteNav(page).getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
    expect(errors).toEqual([]);
  });
});

test.describe("Home on a phone", () => {
  test.use({ reducedMotion: "reduce" });

  test("the band's Get notified takes you to the hero's form, cursor in the field", async ({ page }) => {
    const errors = await openStory(page, "screens-website--large", PHONE, "light");
    const buttons = page.getByRole("button", { name: "Get notified", exact: true });
    // The hero's own button, then the band's, then the closing's.
    await expect(buttons).toHaveCount(3);
    await buttons.nth(1).click();
    const field = page.getByRole("textbox", { name: "Email" }).first();
    await expect(field).toBeFocused();
    await expectInViewport(page, field);
    expect(errors).toEqual([]);
  });

  test("the questions fold: the first open, another opens on a tap or Enter", async ({ page }) => {
    const errors = await openStory(page, "screens-website--large", PHONE, "light");
    const folds = page.locator("h3 > button[aria-expanded]");
    await expect(folds).toHaveCount(3);
    await expect(folds.nth(0)).toHaveAttribute("aria-expanded", "true");
    await expect(folds.nth(1)).toHaveAttribute("aria-expanded", "false");
    await expectTabReaches(page, folds.nth(1));
    await page.keyboard.press("Enter");
    await expect(folds.nth(1)).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText(/^The open-source version is free to run/).filter({ visible: true })).toBeVisible();
    await folds.nth(0).click();
    await expect(folds.nth(0)).toHaveAttribute("aria-expanded", "false");
    expect(errors).toEqual([]);
  });
});
