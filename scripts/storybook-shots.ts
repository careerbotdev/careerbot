import { spawn } from "node:child_process";
import type { Page } from "@playwright/test";

// Shooting screens from the built Storybook (pnpm storybook:build): the server, opening one story the same way every
// time, and the panes to crop to. Used by the docs' screenshots (scripts/docs-shots.ts).

// The built Storybook, served the way the rendered checks serve it (on any free port, so two runs can shoot at once),
// until `stop`.
let origin = "";
export async function serveStorybook() {
  const server = spawn(process.execPath, ["tests/rendered/serve.mjs", "0"], { stdio: ["ignore", "pipe", "inherit"] });
  origin = await new Promise<string>((resolve, reject) => {
    server.stdout.on("data", (chunk: Buffer) => {
      const listening = /storybook-static on (http:\/\/\S+)/.exec(chunk.toString());
      if (listening) resolve(listening[1]);
    });
    server.on("exit", (code) => reject(new Error(`the Storybook server stopped (${code}): run \`pnpm storybook:build\` first`)));
  });
  return { stop: () => server.kill() };
}

export type Pane = "list" | "item" | "third";
export type Act = (page: Page) => Promise<void>;
export type Theme = "light" | "dark";

// Opens one story on its own, in `theme` (light unless asked), with less motion (each mock-up shows its final frame),
// lets its play function finish, then runs `act` (the clicks a story doesn't make itself). The pointer then leaves the
// window, so nothing it clicked last shows its hover, unless the shot is of the hover (`hover`). `root`: a Storybook
// built into a folder of storybook-static/ ("/launch"), else the app's.
export async function openStory(page: Page, story: string, act?: Act, { hover = false, theme = "light", root = "" }: { hover?: boolean; theme?: Theme; root?: string } = {}) {
  if (!origin) throw new Error("serveStorybook() first");
  await page.goto(`${origin}${root}/iframe.html?id=${story}&viewMode=story&globals=theme:${theme}`);
  await page.locator("#storybook-root > *").first().waitFor();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
  if (act) {
    await act(page);
    if (!hover) await page.mouse.move(-10, -10);
    await page.waitForTimeout(600);
  }
  await page.addStyleTag({ content: "* { caret-color: transparent !important; }" });
  await page.evaluate(() => document.fonts.ready);
}

// The union of the named panes (the screens' #list, #item and #third), in CSS pixels.
export async function panesBox(page: Page, panes: Pane[]) {
  const boxes = await Promise.all(panes.map((p) => page.locator(`#${p}`).boundingBox()));
  if (boxes.some((b) => !b)) throw new Error(`a pane isn't showing: ${panes.join(", ")}`);
  const left = Math.min(...boxes.map((b) => b!.x));
  const right = Math.max(...boxes.map((b) => b!.x + b!.width));
  return { x: left, width: right - left };
}
