// The docs' screenshots (`pnpm docs:shots`, after `pnpm storybook:build`): real screens from the built Storybook, with
// the fictional persona's fixture data, each shot light and dark and cropped to what its page explains. Writes
// public/docs-shots/<id>-light.webp and <id>-dark.webp (static files, not bundled into the app) and
// src/app/docs/shots.json: each shot's story, the story's file and export, and its size in CSS pixels, which the docs'
// <Shot> reads and `pnpm lint` checks (scripts/docs-check.ts: every shot a page shows exists, every shot's story still
// exists, and no shot or file is left over). `pnpm docs:shots today review` renders only those shots.
// Each screen is shot with less motion and finished transitions, at 2x, so a run gives the same pictures for the same
// build. No Remotion: the docs ship in the public repo.
import { chromium, type Browser, type Page } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Act, openStory, type Pane, panesBox, serveStorybook, type Theme } from "./storybook-shots";

export const SHOTS_DIR = "public/docs-shots";
export const SHOTS_JSON = "src/app/docs/shots.json";
const SCALE = 2;
const QUALITY = 0.9;
const THEMES: Theme[] = ["light", "dark"];
// Some fixtures date things from now ("Posted today", "saved 10:30"): the shots are taken at one fixed moment, in one
// place, so they don't change from day to day. A Monday, a week after the fixtures' own dates.
const CLOCK = { at: new Date("2026-10-05T10:30:00-04:00"), timezoneId: "America/New_York", locale: "en-US" };

// A medium window (768 to 1279) shows the list (320 wide, with a 1px edge) beside the item; `ITEM` keeps the item.
const ITEM = { x: 321 };

// `width` and `height`: the window, in CSS pixels. `crop`: the large layout's panes to keep (the window 1280 or wider),
// or the left edge of what's kept and its width (the rest of the window if left out), from `y` down; the shot is
// `height` tall from there. Else the whole window. `act`: clicks after the story's own.
export type Spec = { id: string; story: string; width: number; height: number; crop?: Pane[] | { x: number; width?: number; y?: number }; act?: Act };
export type Shot = { story: string; source: string; export: string; width: number; height: number };

const openGroup =
  (name: string): Act =>
  async (page) => {
    await page.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  };
const closeDrawer: Act = async (page) => {
  await page.keyboard.press("Escape");
};

// One per screen or step a page explains, in the order the docs walk through them.
export const SPECS: Spec[] = [
  { id: "sign-in", story: "screens-sign-in--sign-in", width: 480, height: 720 },
  { id: "create-account", story: "screens-sign-in-self-hosted--create-account", width: 480, height: 860, crop: { x: 0, y: 270 } },
  { id: "getting-started", story: "screens-getting-started--setup-in-progress", width: 820, height: 720 },
  { id: "openrouter-key", story: "screens-getting-started--key-and-budget", width: 1000, height: 640, crop: ITEM },
  { id: "today", story: "screens-today--lines", width: 820, height: 600 },
  { id: "review", story: "screens-review--waiting", width: 820, height: 440 },
  { id: "review-fact", story: "screens-review--waiting", width: 1000, height: 420, crop: ITEM, act: openGroup("Facts") },
  { id: "story-talk", story: "screens-story--talk-stopped", width: 1000, height: 660, crop: ITEM },
  { id: "story-read", story: "screens-story--read-results", width: 1000, height: 520, crop: ITEM },
  { id: "goals", story: "screens-goals--produced", width: 1000, height: 720, crop: ITEM },
  { id: "direction", story: "screens-directions--direction", width: 1000, height: 640, crop: ITEM },
  { id: "role", story: "screens-pursuits--role", width: 820, height: 680 },
  { id: "role-tab", story: "screens-pursuits--pursuit-role", width: 1000, height: 700, crop: ITEM },
  { id: "choose-path", story: "screens-pursuits--choose-path", width: 1000, height: 540, crop: ITEM },
  { id: "people", story: "screens-pursuits--people", width: 1000, height: 640, crop: ITEM, act: closeDrawer },
  { id: "outreach-message", story: "screens-pursuits--people", width: 1440, height: 660, crop: ["third"] },
  { id: "resume", story: "screens-resumes--tailored", width: 1000, height: 640, crop: ITEM },
  { id: "requirements", story: "screens-resumes--tailored", width: 1440, height: 500, crop: ["third"] },
  { id: "companies", story: "screens-companies--target", width: 820, height: 640 },
  { id: "reports", story: "screens-reports--overview", width: 820, height: 600 },
  { id: "account-self-hosted", story: "screens-settings--account-self-hosted", width: 1000, height: 540, crop: ITEM },
];

// The story's file and export, from the built Storybook's index, so the check can see the story still exists.
function storyIndex(): Record<string, { importPath: string; exportName: string }> {
  const index = "storybook-static/index.json";
  if (!existsSync(index)) throw new Error("storybook-static/ has no build: run `pnpm storybook:build` first");
  const built: { entries: Record<string, { importPath: string; exportName: string }> } = JSON.parse(readFileSync(index, "utf8"));
  return built.entries;
}

// The screen, at 2x, then encoded as WebP by the same browser (a canvas), so the pipeline needs nothing more.
async function shoot(browser: Browser, encoder: Page, spec: Spec, theme: Theme) {
  const top = spec.crop && !Array.isArray(spec.crop) ? (spec.crop.y ?? 0) : 0;
  const context = await browser.newContext({
    viewport: { width: spec.width, height: top + spec.height },
    deviceScaleFactor: SCALE,
    reducedMotion: "reduce",
    colorScheme: theme,
    timezoneId: CLOCK.timezoneId,
    locale: CLOCK.locale,
  });
  await context.clock.setFixedTime(CLOCK.at);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().split("\n")[0]));
  await openStory(page, spec.story, spec.act, { theme });
  // Nothing the story clicked keeps its focus ring.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.waitForTimeout(150);
  let clip = { x: 0, y: 0, width: spec.width, height: spec.height };
  if (Array.isArray(spec.crop)) clip = { ...clip, ...(await panesBox(page, spec.crop)) };
  else if (spec.crop) clip = { x: spec.crop.x, y: top, width: spec.crop.width ?? spec.width - spec.crop.x, height: spec.height };
  const png = await page.screenshot({ clip, animations: "disabled" });
  await context.close();
  if (errors.length) throw new Error(`${spec.story} (${theme}) failed: ${errors.join("; ")}`);
  const webp = await encoder.evaluate(
    async ({ src, quality }) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      return canvas.toDataURL("image/webp", quality).split(",")[1];
    },
    { src: `data:image/png;base64,${png.toString("base64")}`, quality: QUALITY },
  );
  return { bytes: Buffer.from(webp, "base64"), width: Math.round(clip.width), height: Math.round(clip.height) };
}

async function main() {
  const only = process.argv.slice(2);
  const unknown = only.filter((id) => !SPECS.some((s) => s.id === id));
  if (unknown.length) throw new Error(`no such shot: ${unknown.join(", ")}`);
  const specs = only.length ? SPECS.filter((s) => only.includes(s.id)) : SPECS;
  const stories = storyIndex();
  const missing = specs.filter((s) => !stories[s.story]);
  if (missing.length) throw new Error(`not in the built Storybook: ${missing.map((s) => s.story).join(", ")}`);

  await mkdir(SHOTS_DIR, { recursive: true });
  const kept: Record<string, Shot> = only.length && existsSync(SHOTS_JSON) ? JSON.parse(readFileSync(SHOTS_JSON, "utf8")) : {};
  const server = await serveStorybook();
  const browser = await chromium.launch();
  try {
    const encoder = await browser.newPage();
    const fresh: Record<string, Shot> = {};
    let total = 0;
    for (const spec of specs) {
      let size = { width: 0, height: 0 };
      for (const theme of THEMES) {
        const shot = await shoot(browser, encoder, spec, theme);
        const file = join(SHOTS_DIR, `${spec.id}-${theme}.webp`);
        await writeFile(file, shot.bytes);
        size = { width: shot.width, height: shot.height };
        total += shot.bytes.length;
        console.log(`${file.padEnd(48)} ${`${shot.width * SCALE}x${shot.height * SCALE}`.padEnd(10)} ${(shot.bytes.length / 1024).toFixed(0).padStart(5)} KB`);
      }
      const { importPath, exportName } = stories[spec.story];
      fresh[spec.id] = { story: spec.story, source: importPath.replace(/^\.\//, ""), export: exportName, ...size };
    }
    // In the order of SPECS, whether rendered now or kept from before.
    const all = { ...kept, ...fresh };
    const shots = Object.fromEntries(SPECS.filter((s) => all[s.id]).map((s) => [s.id, all[s.id]]));
    await writeFile(SHOTS_JSON, `${JSON.stringify(shots, null, 2)}\n`);
    // A shot no longer in SPECS leaves no file behind.
    const files = new Set(Object.keys(shots).flatMap((id) => THEMES.map((t) => `${id}-${t}.webp`)));
    for (const f of readdirSync(SHOTS_DIR)) if (!files.has(f)) rmSync(join(SHOTS_DIR, f));
    console.log(`${specs.length * THEMES.length} shots, ${(total / 1024).toFixed(0)} KB, in ${SHOTS_DIR}`);
  } finally {
    await browser.close();
    server.stop();
  }
}

// A CommonJS script (the package isn't an ES module), so no top-level await. Run only when run, not when the check
// reads SPECS.
if (require.main === module)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
